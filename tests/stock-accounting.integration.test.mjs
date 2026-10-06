import 'dotenv/config';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const p=new Pool({connectionString:process.env.DATABASE_URL}),c=await p.connect();
const schema='stock_test_'+randomUUID().replaceAll('-','');
async function sql(text,args=[]){await c.query('BEGIN');try{await c.query(`SET LOCAL search_path TO "${schema}"`);const r=await c.query(text,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
const migration=name=>readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8');
async function balance(account='stock'){return Number((await sql(`SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) n FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE l.account_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL`,[account])).rows[0].n);}
try{
 await c.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');
 CREATE TABLE products(id text PRIMARY KEY,company_id text,name text,purchaseorder_id text);
 CREATE TABLE variants(id text PRIMARY KEY,company_id text,product_id text REFERENCES products(id) ON DELETE CASCADE,p_price numeric);
 CREATE TABLE items(id text PRIMARY KEY,company_id text,variant_id text REFERENCES variants(id) ON DELETE CASCADE,qty integer);
 CREATE TABLE accountant_v2_distributor_sources(company_id text,distributor_id text,source_key text,accounts jsonb,journal_id text);
 INSERT INTO companies(id) VALUES('a'),('b');`);
 await sql(migration('20260926120000_accountant_v2'));
 await sql(`CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,banking boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM accountant_v2_transaction_locks WHERE company_id=c AND is_locked AND module IN ('ALL','ACCOUNTS') AND lock_date>=d) THEN RAISE EXCEPTION 'Locked'; END IF; END $$;`);
 await sql(migration('20260929110000_stock_control'));
 await sql(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES
 ('stock','a','Stock','STOCK','ASSET',now()),('opening','a','Opening Inventory','EQUITY','EQUITY',now()),('adjust','a','Inventory Adjustments','EXPENSE','EXPENSE',now()),('payable','a','AP','ACCOUNTS_PAYABLE','LIABILITY',now()),('cogs','a','COGS','COST_OF_GOODS_SOLD','EXPENSE',now());
 INSERT INTO products VALUES('p','a','Unlinked stock',NULL);
 INSERT INTO variants VALUES('v','a','p',10);INSERT INTO items VALUES('i','a','v',10);
 INSERT INTO accountant_v2_stock_control(company_id,stock_account_id,opening_account_id,adjustment_account_id,enabled) VALUES('a','stock','opening','adjust',true);
 SELECT accountant_v2_sync_stock('a');`);
 assert.equal(await balance(),100);assert.equal(await balance('opening'),-100);
 assert.equal((await sql("SELECT accountant_v2_sync_stock('a') n")).rows[0].n,0);
 await sql("UPDATE items SET qty=12 WHERE id='i'");assert.equal(await balance(),120);assert.equal(await balance('adjust'),-20);
 await sql("UPDATE variants SET p_price=15 WHERE id='v'");assert.equal(await balance(),180);
 // Native sale and quantity change in one transaction should not also post an adjustment.
 const adjustments=await balance('adjust');
 await sql(`UPDATE items SET qty=10 WHERE id='i';
 INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,total,status,source_type,updated_at) VALUES('sale','a','SALE',now(),'Sale',30,'PUBLISHED','ERP_BILL',now());
 INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES('sale-stock','a','sale','stock','CREDIT',30,now()),('sale-cogs','a','sale','cogs','DEBIT',30,now());`);
 assert.equal(await balance(),150);assert.equal(await balance('adjust'),adjustments,'Native stock movement is not counted twice');
 // Link product to a PO with matching already-posted purchase amount.
 await sql(`INSERT INTO products VALUES('p2','a','PO stock','po');INSERT INTO variants VALUES('v2','a','p2',20);INSERT INTO items VALUES('i2','a','v2',5);
 INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,total,status,source_type,updated_at) VALUES('purchase','a','PO',now(),'Purchase',100,'PUBLISHED','DISTRIBUTOR',now());
 INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES('purchase-stock','a','purchase','stock','DEBIT',100,now()),('purchase-ap','a','purchase','payable','CREDIT',100,now());
 INSERT INTO accountant_v2_distributor_sources VALUES('a','vendor','purchase:po','{"stock":"stock"}','purchase');`);
 assert.equal(await balance(),250);assert.equal(await balance('adjust'),adjustments);
 assert.equal((await sql("SELECT source_snapshot FROM accountant_v2_stock_control WHERE company_id='a'")).rows[0].source_snapshot.find(x=>x.product_id==='p2').purchase_order_id,'po');
 await sql("DELETE FROM products WHERE id='p2'");assert.equal(await balance(),150);
 await sql("UPDATE items SET qty=-1 WHERE id='i'");assert.equal(await balance(),-15,'Negative source stock is represented, not silently clamped');
 await sql("INSERT INTO products VALUES('foreign','b','Other company',NULL);INSERT INTO variants VALUES('fv','b','foreign',99);INSERT INTO items VALUES('fi','b','fv',99)");assert.equal(await balance(),-15);
 await sql("INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,is_locked,updated_at,locked_by_id) VALUES('lock','a','ALL','2099-01-01','Closed',true,now(),'tester')");
 await assert.rejects(sql("UPDATE items SET qty=9 WHERE id='i'"),/Locked/);
 assert.equal((await sql("SELECT qty FROM items WHERE id='i'")).rows[0].qty,-1);
 await sql("DELETE FROM accountant_v2_transaction_locks WHERE id='lock'");
 await sql("DELETE FROM products WHERE id='p'");assert.equal(await balance(),0);
 assert.equal((await sql("SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0")).rowCount,0);
 console.log('Stock control passed: opening, no-PO quantities/costs, PO links, native sale/purchase deduplication, delete, negative stock, company isolation, locks, balanced journals and repeat no-op.');
}finally{await sql(`DROP SCHEMA "${schema}" CASCADE`);c.release();await p.end();}
