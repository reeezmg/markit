import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {installPurchaseOrderAuthority} from '../scripts/production-accounting/lib/purchase-order-authority.mjs';

const schema='po_authority_test_'+randomUUID().replaceAll('-','');
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:20000}),db=await pool.connect();
try {
 await db.query('BEGIN');
 await db.query(`CREATE SCHEMA "${schema}"`);
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 const fixture=readFileSync(new URL('./distributor-accounting.integration.test.ts',import.meta.url),'utf8').match(/await pg.query\(`([\s\S]*?)`\);/)[1];
 await db.query(fixture);
 for(const name of ['20260926120000_accountant_v2','20260927120000_distributor_accounting','20260927123000_distributor_history_projection','20260927130000_distributor_purchase_tax'])
   await db.query(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8'));
 await db.query('ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN source_parties jsonb');
 await db.query(`INSERT INTO companies VALUES('a','INR'),('b','INR'); INSERT INTO distributors VALUES('vendor','Vendor'),('other','Other');
 INSERT INTO distributor_companies(company_id,distributor_id) VALUES('a','vendor'),('a','other');
 INSERT INTO accountant_v2_accountant_contact(id,company_id,name,type,updated_at) VALUES('contact','a','Vendor','VENDOR',now()),('contact2','a','Other','VENDOR',now());
 INSERT INTO accountant_v2_distributor_settings(company_id,distributor_id,contact_id,enabled) VALUES('a','vendor','contact',true),('a','other','contact2',true);
 INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,category,account_type,updated_at) VALUES
 ('ap','a','Payable','LIABILITY','ACCOUNTS_PAYABLE',now()),('stock','a','Stock','ASSET','STOCK',now()),
 ('tax','a','Input GST','ASSET','OTHER_CURRENT_ASSET',now()),('cash','a','Cash','ASSET','CASH',now()),('opening','a','Opening','EQUITY','EQUITY',now()),
 ('foreign','b','Foreign','LIABILITY','ACCOUNTS_PAYABLE',now());
 INSERT INTO accountant_v2_distributor_mappings(company_id,distributor_id,role,account_id)
 SELECT 'a',d.id,x.role,x.account FROM distributors d CROSS JOIN (VALUES('payable','ap'),('stock','stock'),('tax','tax'),('cash','cash'),('opening','opening')) x(role,account);
 INSERT INTO purchase_orders(id,company_id,distributor_id,created_at,total_amount,subtotal_amount,tax,purchase_order_no,payment_type) VALUES
 ('conflict','a','vendor','2026-02-01',12000,12000,0,264,'CREDIT'),
 ('missing','a','vendor','2026-02-02',1050,1000,5,219,NULL),
 ('anonymous','a',NULL,'2026-02-03',1100,1000,10,16,NULL),
 ('untouched','a','vendor','2026-02-04',100,100,0,300,'CREDIT');
 INSERT INTO distributor_credits(id,company_id,distributor_id,amount,purchase_order_id) VALUES
 ('c1','a','vendor',12000,'conflict'),('c2','a','vendor',12000,'conflict'),('c3','a','vendor',200,'untouched');`);
 await db.query("SELECT accountant_v2_sync_distributor('a','vendor')");
 await installPurchaseOrderAuthority(db);
 const cfg={payable:'ap',stock:'stock',tax:'tax'};
 for(const pid of ['conflict','missing','anonymous']) await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES($1,'a','test','authorize','purchase-order-header-authority',$1,$2,now())`,[pid,JSON.stringify({accounts:cfg})]);
 const sync=async()=>Number((await db.query("SELECT accountant_v2_sync_distributor('a','vendor')+accountant_v2_sync_distributor('a','other')+accountant_v2_sync_unassigned_purchase('a','anonymous') AS changes")).rows[0].changes);
 await sync(); await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 const gross=async pid=>Number((await db.query(`SELECT j.total FROM accountant_v2_distributor_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id WHERE s.company_id='a' AND s.source_key='purchase:'||$1`,[pid])).rows[0]?.total??0);
 assert.equal(await gross('conflict'),12000); assert.equal(await gross('missing'),1050); assert.equal(await gross('untouched'),200,'Unapproved source keeps credit policy');
 assert.equal(Number((await db.query("SELECT sum(amount) n FROM distributor_credits WHERE purchase_order_id='conflict'")).rows[0].n),24000,'Old credits unchanged');
 const anonymous=async()=> (await db.query(`SELECT "after" state FROM accountant_v2_accountant_audit WHERE company_id='a' AND resource='purchase-order-source-state' AND "resourceId"='anonymous' ORDER BY ("after"->>'revision')::int DESC LIMIT 1`)).rows[0].state;
 let state=await anonymous();
 assert.equal(Number(state.signature.gross),1100); assert.equal(Number(state.signature.tax),100);
 assert.equal(Number((await db.query('SELECT count(*) n FROM accountant_v2_manual_journal_lines WHERE journal_id=$1 AND (party_id IS NOT NULL OR distributor_id IS NOT NULL)',[state.journalId])).rows[0].n),0);
 assert.equal(await sync(),0,'Repeat produces no journals');
 await db.query("UPDATE purchase_orders SET total_amount=1650,subtotal_amount=1500 WHERE id='anonymous'");
 state=await anonymous(); assert.equal(Number(state.signature.gross),1650); assert.equal(Number(state.signature.tax),150,'Source edit refreshes tax');
 await db.query("UPDATE purchase_orders SET distributor_id='other' WHERE id='anonymous'");
 assert.equal((await anonymous()).signature.kind,'DELETED'); assert.equal(await gross('anonymous'),1650,'Supplier assignment replaces anonymous posting');
 assert.equal((await db.query("SELECT distributor_id FROM accountant_v2_distributor_sources WHERE source_key='purchase:anonymous' AND journal_id IS NOT NULL")).rows[0].distributor_id,'other');
 await db.query("INSERT INTO distributor_credits(id,company_id,distributor_id,amount,purchase_order_id) VALUES('c4','a','vendor',5000,'conflict')");
 assert.equal(await gross('conflict'),12000,'Further credits cannot multiply approved header');
 await db.query("DELETE FROM purchase_orders WHERE id='anonymous'");
 assert.equal(await gross('anonymous'),0,'Source deletion reverses posting');
 await db.query('SAVEPOINT invalid');
 await assert.rejects(db.query("UPDATE purchase_orders SET total_amount=-1 WHERE id='missing'"));
 await db.query('ROLLBACK TO SAVEPOINT invalid');
 await db.query(`INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,is_locked,updated_at,locked_by_id) VALUES('lock','a','ALL','2026-02-28','Closed',true,now(),'test')`);
 await db.query('SAVEPOINT locked');
 await assert.rejects(db.query("UPDATE purchase_orders SET total_amount=2000 WHERE id='missing'"));
 await db.query('ROLLBACK TO SAVEPOINT locked');
 await db.query("DELETE FROM accountant_v2_transaction_locks WHERE id='lock'");
 await db.query("INSERT INTO purchase_orders(id,company_id,created_at,total_amount,subtotal_amount,tax) VALUES('foreign-map','a','2026-02-05',100,100,0)");
 await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES('foreign-map','a','test','authorize','purchase-order-header-authority','foreign-map',$1,now())`,[JSON.stringify({accounts:{...cfg,payable:'foreign'}})]);
 await db.query('SAVEPOINT tenant');
 await assert.rejects(db.query("SELECT accountant_v2_sync_unassigned_purchase('a','foreign-map')"));
 await db.query('ROLLBACK TO SAVEPOINT tenant');
 assert.equal(Number((await db.query(`SELECT count(*) n FROM (SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id GROUP BY j.id HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0) x`)).rows[0].n),0);
 assert.equal(await sync(),0);
 console.log('Passed: PO authority, missing purchases/tax, unchanged credits/payments, no invented supplier, source edits/deletion/assignment, idempotency, negative-value rejection, locks, tenant mapping and balanced journals. All fixture objects rolled back.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
