import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const url=new URL(process.env.DATABASE_URL!);
const schema=`erp_test_${randomUUID().replaceAll('-','')}`;
const pool=new Pool({connectionString:process.env.DATABASE_URL});const c=await pool.connect();let db:any;
async function sql(text:string,args:any[]=[]){await c.query('BEGIN');try{await c.query(`SET LOCAL search_path TO "${schema}"`);const r=await c.query(text,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
try {
 await c.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');
 CREATE TABLE bills(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),invoice_number int,account_id text,client_id text,user_id text,credit_user_id text,grand_total numeric,payment_method text,payment_status text DEFAULT 'PAID',split_payments jsonb,deleted boolean DEFAULT false,is_markit boolean DEFAULT false,type text DEFAULT 'BILL',notes text);
 CREATE TABLE accounts(id text PRIMARY KEY,company_id text,name text);
 INSERT INTO accounts VALUES('b2b','a','Credit Customer'),('foreign-b2b','b','Foreign');
 CREATE TABLE clients(id text PRIMARY KEY,name text);
 CREATE TABLE company_clients(company_id text,client_id text);
 CREATE TABLE company_users(company_id text,user_id text,name text);
 INSERT INTO clients VALUES('customer','Customer One'),('foreign','Foreign Customer');
 INSERT INTO company_clients VALUES('a','customer'),('b','foreign');
 INSERT INTO company_users VALUES('a','staff','Sales Staff'),('a','employee','Employee'),('b','outsider','Outsider');
 CREATE TABLE variants(id text PRIMARY KEY,p_price numeric);
 CREATE TABLE entries(id text PRIMARY KEY,bill_id text,variant_id text,qty numeric,value numeric,tax numeric,return boolean DEFAULT false);
 CREATE TABLE expenses(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),expense_date timestamp DEFAULT now(),expense_number int,from_id text,total_amount numeric,tax_amount numeric,payment_mode text,status text,note text,currency text DEFAULT 'INR');
 CREATE TABLE distributor_payments(id text PRIMARY KEY,company_id text,expense_id text);
 INSERT INTO companies(id) VALUES('a'),('b');`);
 await sql(readFileSync(new URL('../prisma/migrations/20260926120000_accountant_v2/migration.sql',import.meta.url),'utf8'));
 await sql(`ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN distributor_id text;
 CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,banking boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM accountant_v2_transaction_locks WHERE company_id=c AND is_locked AND module IN ('ALL','ACCOUNTS','BANKING') AND lock_date>=d) THEN RAISE EXCEPTION 'Locked'; END IF; END $$;`);
 await sql(readFileSync(new URL('../prisma/migrations/20260927150000_erp_accounting/migration.sql',import.meta.url),'utf8'));
 await sql(readFileSync(new URL('../prisma/migrations/20260927151000_erp_deleted_source_stability/migration.sql',import.meta.url),'utf8'));
 await sql(readFileSync(new URL('../prisma/migrations/20260927160000_expense_tax_recovery/migration.sql',import.meta.url),'utf8'));
 url.searchParams.set('schema',schema);url.searchParams.set('statement_cache_size','0');process.env.DATABASE_URL=url.toString();
 db=(await import('../server/prisma')).prisma;
 const {runAccountant}=await import('../server/utils/accountant/context');
 const {erpAccountingSettings,configureErpAccounting,enableErpAccounting,erpAccountingRouter}=await import('../server/utils/accountant/erp');
 const run=(fn:()=>Promise<any>,companyId='a')=>runAccountant({companyId,userId:'tester',role:'manager'},fn);
 const {accountingAccountRouter}=await import('../server/utils/accountant/accounts');
 const {manualJournalRouter}=await import('../server/utils/accountant/journals');
 const readAccounting=async(router:any,path:string)=>run(async()=>{
   let data:any;const res={json(value:any){data=value;return res;},status(){return res;}};
   await router.dispatch('GET',path,{user:{companyId:'a',userId:'tester',role:'manager'},query:{},params:{}},res);
   return data;
 });
 await sql("INSERT INTO bills(id,company_id,grand_total,payment_method) VALUES('old','a',30,'Cash')");
 const state=await run(()=>enableErpAccounting());assert.equal(state.enabled,true);
 await sql("UPDATE bills SET grand_total=40 WHERE id='old'");
 assert.equal((await sql('SELECT * FROM accountant_v2_manual_journals')).rowCount,0,'Old source edits are not auto-imported');
 await sql(`INSERT INTO variants VALUES('v',40);
 INSERT INTO bills(id,company_id,invoice_number,grand_total,payment_method,client_id,user_id) VALUES('sale','a',1,118,'Cash','customer','staff');
 INSERT INTO entries VALUES('entry','sale','v',1,118,18,false);`);
 await sql(readFileSync(new URL('../prisma/migrations/20260927170000_erp_party_links/migration.sql',import.meta.url),'utf8'));
 await sql(readFileSync(new URL('../prisma/migrations/20260930140000_customer_account_links/migration.sql',import.meta.url),'utf8'));
 assert.equal((await sql(`SELECT accountant_v2_erp_parties('a','BILL','{"account_id":"b2b"}'::jsonb) AS p`)).rows[0].p.creditAccount.name,'Credit Customer');
 await assert.rejects(sql(`SELECT accountant_v2_erp_parties('a','BILL','{"account_id":"foreign-b2b"}'::jsonb)`),/does not belong/);
 const parties=async(key:string)=>(await sql(`SELECT l.source_parties FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_erp_sources s ON s.journal_id=l.journal_id WHERE s.company_id='a' AND s.source_key=$1`,[key])).rows.map(r=>r.source_parties);
 const billParties={client:{id:'customer',name:'Customer One'},user:{id:'staff',name:'Sales Staff'}};
 assert.ok((await parties('bill:sale')).length>0);
 for(const p of await parties('bill:sale')) assert.deepEqual(p,billParties,'Current posted bill backfilled without changing amounts');
 await assert.rejects(sql("UPDATE bills SET client_id='foreign' WHERE id='sale'"),/does not belong/);
 await assert.rejects(sql("UPDATE bills SET user_id='outsider' WHERE id='sale'"),/does not belong/);
 await sql("UPDATE bills SET credit_user_id='employee' WHERE id='sale'");
 for(const p of await parties('bill:sale')) assert.deepEqual(p,{...billParties,creditUser:{id:'employee',name:'Employee'}});
 const stored=await db.accountantManualJournalLine.findMany({where:{companyId:'a',sourceParties:{path:['creditUser','id'],equals:'employee'}}});
 assert.ok(stored.length>0,'Prisma exposes the persisted person links to accounting APIs');
 await sql("UPDATE company_users SET name='Renamed Employee' WHERE company_id='a' AND user_id='employee'");
 assert.equal((await sql("SELECT accountant_v2_sync_erp('a','BILL','sale') AS n")).rows[0].n,0,'Names stay snapshotted without reposting');
 await sql("UPDATE company_users SET name='Employee' WHERE company_id='a' AND user_id='employee'");
 const reversal=(await sql("SELECT l.source_parties FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE j.source_type='ERP_REVERSAL' ORDER BY j.created_at DESC LIMIT 1")).rows[0];
 assert.deepEqual(reversal.source_parties,billParties,'Reversal retains original parties');
 await sql("UPDATE bills SET client_id=NULL,credit_user_id=NULL WHERE id='sale'");
 for(const p of await parties('bill:sale')) assert.deepEqual(p,{user:billParties.user},'Removing links updates attribution');
 const balance=async(role:string)=>Number((await sql(`SELECT COALESCE(sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END),0) AS n FROM accountant_v2_manual_journal_lines WHERE account_id=$1`,[state.mappings[role]])).rows[0].n);
 const cashLedger=await readAccounting(accountingAccountRouter,`/${state.mappings.cash}/ledger`);
 assert.equal(cashLedger.closingBalance,118,'Accountant read API reports the ERP cash balance');
 assert.ok(cashLedger.data.some((line:any)=>line.sourceParties?.user?.id==='staff'),'Accountant ledger exposes source user');
 const currentJournal=(await sql("SELECT journal_id FROM accountant_v2_erp_sources WHERE company_id='a' AND source_key='bill:sale'")).rows[0].journal_id;
 const journalDetails=await readAccounting(manualJournalRouter,`/${currentJournal}`);
 assert.ok(journalDetails.lines.every((line:any)=>line.sourceParties?.user?.id==='staff'),'Journal details preserve staff attribution');
 assert.equal(await balance('cash'),118);assert.equal(await balance('sales'),-100);assert.equal(await balance('outputTax'),-18);assert.equal(await balance('stock'),-40);assert.equal(await balance('cogs'),40);
 assert.equal((await sql("SELECT accountant_v2_sync_erp('a','BILL','sale') AS n")).rows[0].n,0);
 await sql("UPDATE variants SET p_price=80; UPDATE bills SET payment_method='Credit',payment_status='PENDING' WHERE id='sale'");
 assert.equal(await balance('cash'),0);assert.equal(await balance('receivable'),118);assert.equal(await balance('cogs'),40,'Cost snapshot survives price changes');
 await sql("UPDATE bills SET account_id='b2b' WHERE id='sale'");
 assert.equal((await readAccounting(erpAccountingRouter,'/customers/b2b')).due,118);
 assert.ok((await parties('bill:sale')).every((p:any)=>p.creditAccount.id==='b2b'));
 await assert.rejects(sql("UPDATE bills SET account_id='foreign-b2b' WHERE id='sale'"),/does not belong/);
 await assert.rejects(readAccounting(erpAccountingRouter,'/customers/foreign-b2b'),/not found/);

 await sql("UPDATE bills SET payment_method='Split',split_payments='[{\"method\":\"Cash\",\"amount\":50},{\"method\":\"UPI\",\"amount\":68}]' WHERE id='sale'");
 assert.equal(await balance('cash'),50);assert.equal(await balance('bank'),68);assert.equal(await balance('receivable'),0);
 assert.equal((await readAccounting(erpAccountingRouter,'/customers/b2b')).due,0,'Customer receivable clears after settlement');
 await assert.rejects(sql("UPDATE bills SET split_payments='[]' WHERE id='sale'"));
 await sql("UPDATE bills SET deleted=true WHERE id='sale'");assert.equal(await balance('cash'),0);assert.equal(await balance('stock'),0);
 await sql("UPDATE bills SET deleted=false WHERE id='sale'");assert.equal(await balance('cash'),50);assert.equal(await balance('cogs'),40,'Restore retains original cost');
 await sql(`INSERT INTO bills(id,company_id,invoice_number,grand_total,payment_method) VALUES('return','a',2,-118,'Cash');
 INSERT INTO entries VALUES('return-entry','return','v',1,118,18,true);`);
 assert.equal(await balance('cash'),-68);assert.equal(await balance('sales'),0);assert.equal(await balance('outputTax'),0);
 await sql("UPDATE bills SET deleted=true WHERE id='return'");assert.equal(await balance('cash'),50);
 await sql("INSERT INTO expenses(id,company_id,total_amount,tax_amount,recoverable_tax_amount,payment_mode,status,from_id) VALUES('expense','a',110,10,10,'CASH','Pending','employee')");
 for(const p of await parties('expense:expense')) assert.deepEqual(p,{user:{id:'employee',name:'Employee'}});
 await assert.rejects(sql("UPDATE expenses SET from_id='outsider' WHERE id='expense'"),/does not belong/);
 assert.equal(await balance('expense'),100);assert.equal(await balance('inputTax'),10);assert.equal(await balance('expensePayable'),-110);
 await sql("UPDATE expenses SET recoverable_tax_amount=4 WHERE id='expense'");
 assert.equal(await balance('expense'),106);assert.equal(await balance('inputTax'),4);
 await sql("UPDATE expenses SET recoverable_tax_amount=0 WHERE id='expense'");
 assert.equal(await balance('expense'),110);assert.equal(await balance('inputTax'),0);
 await assert.rejects(sql("UPDATE expenses SET recoverable_tax_amount=11 WHERE id='expense'"));
 await sql("UPDATE expenses SET status='Paid' WHERE id='expense'");assert.equal(await balance('expensePayable'),0);assert.equal(await balance('cash'),-60);
 await sql("DELETE FROM expenses WHERE id='expense'");assert.equal(await balance('expense'),0);
 assert.equal((await sql("SELECT accountant_v2_sync_erp('a','EXPENSE','expense') AS n")).rows[0].n,0,'Deleted source reconciliation remains a no-op');
 await sql("INSERT INTO expenses(id,company_id,total_amount,tax_amount,payment_mode,status) VALUES('supplier','a',90,0,'CASH','Paid'); INSERT INTO distributor_payments VALUES('dp','a','supplier')");assert.equal(await balance('expense'),0,'No duplicate expense for supplier payment');
 await assert.rejects(run(()=>configureErpAccounting(state.mappings),'b'),'Cross company accounts rejected');
 await sql("INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,is_locked,updated_at,locked_by_id) VALUES('lock','a','ALL','2099-01-01','Closed',true,now(),'tester')");
 await assert.rejects(sql("UPDATE bills SET deleted=true WHERE id='sale'"));
 assert.equal((await sql("SELECT deleted FROM bills WHERE id='sale'")).rows[0].deleted,false,'Source write rolls back on accounting failure');
 assert.equal((await sql("SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0")).rowCount,0);
 // Upgrade a legacy cash migration to full ERP accounting without duplicating cash.
 await sql("DELETE FROM accountant_v2_transaction_locks WHERE id='lock'");
 await sql(`INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,total,status,is_system_generated,source_type,source_id,updated_at)
 VALUES('legacy-old','a','LCB-OLD','2026-01-01','BILL:old','Legacy migration',40,'PUBLISHED',true,'LEGACY_CASH_BANK_HISTORY','old-hash',now());
 INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES
 ('legacy-cash','a','legacy-old','${state.mappings.cash}','DEBIT',40,now()),('legacy-offset','a','legacy-old','${state.mappings.expensePayable}','CREDIT',40,now());
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
 VALUES('legacy-audit','a','test','imported','legacy-cash-bank-import','legacy-old','{"source":"BILL:old"}',now());`);
 const beforeHistoryCash=await balance('cash');
 const helper=readFileSync(new URL('../scripts/production-accounting/lib/import-erp-history.sql',import.meta.url),'utf8');
 // The indexed migration lookup must retain the original provenance/reversal guards.
 await sql(`UPDATE accountant_v2_accountant_audit SET "after"='{"source":"BILL:wrong"}' WHERE id='legacy-audit'`);
 await sql(helper+`DO $$ DECLARE r jsonb; BEGIN
 r:=pg_temp.import_erp_history_source('a','BILL','old');
 IF NOT(r ? 'error') OR r->>'error' NOT LIKE 'Missing migration provenance%' THEN RAISE EXCEPTION 'Missing provenance should be rejected: %',r; END IF;
 END $$;`);
 assert.equal(await balance('cash'),beforeHistoryCash,'Rejected provenance must roll back source posting');
 await sql(`UPDATE accountant_v2_accountant_audit SET "after"='{"source":"BILL:old"}' WHERE id='legacy-audit';
 INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,total,status,source_type,reversed_from_id,updated_at)
 VALUES('outside-reversal','a','OUTSIDE-REV','2026-01-01','Unverified external reversal',0,'PUBLISHED','MANUAL','legacy-old',now());`);
 await sql(helper+`DO $$ DECLARE r jsonb; BEGIN
 r:=pg_temp.import_erp_history_source('a','BILL','old');
 IF NOT(r ? 'error') OR r->>'error' NOT LIKE 'Migration journal already reversed outside ERP history import%' THEN RAISE EXCEPTION 'External reversal should be rejected: %',r; END IF;
 END $$;`);
 assert.equal(await balance('cash'),beforeHistoryCash,'Rejected external reversal must roll back source posting');
 await sql("DELETE FROM accountant_v2_manual_journals WHERE id='outside-reversal'");
 await sql(helper+`DO $$ DECLARE r jsonb; BEGIN
 r:=pg_temp.import_erp_history_source('a','BILL','old');
 IF r ? 'error' OR r->>'changed'<>'1' OR r->>'reversed'<>'1' THEN RAISE EXCEPTION 'History upgrade failed: %',r; END IF;
 r:=pg_temp.import_erp_history_source('a','BILL','old');
 IF r ? 'error' OR r->>'changed'<>'0' OR r->>'reversed'<>'0' THEN RAISE EXCEPTION 'History repeat failed: %',r; END IF;
 END $$;`);
 assert.equal(await balance('cash'),beforeHistoryCash,'Full historical posting must replace, not duplicate migrated cash');
 assert.equal((await sql("SELECT count(*) n FROM accountant_v2_manual_journals WHERE source_type='ERP_HISTORY_MIGRATION_REVERSAL'")).rows[0].n,'1');
 await sql(`UPDATE accountant_v2_manual_journal_lines SET amount=41 WHERE id='legacy-cash'`);
 await sql(helper+`DO $$ DECLARE r jsonb; BEGIN r:=pg_temp.import_erp_history_source('a','BILL','old'); IF NOT(r ? 'error') THEN RAISE EXCEPTION 'Modified reversal should be rejected'; END IF; END $$;`);
 console.log('ERP history upgrade passed: cash migration reversal, source posting, unchanged cash, repeat no-op and reversal tamper rejection.');
 console.log('ERP accounting passed: client/staff/credit-user links, expense user links, party backfill, reversal snapshots, cross-company party rejection, new-only baseline, sales, tax, cost snapshot, credit/split settlement, edits, delete/restore, paid/unpaid expenses, duplicate supplier exclusion, locks and company isolation.');
}finally{await db?.$disconnect();await sql(`DROP SCHEMA "${schema}" CASCADE`);c.release();await pool.end();}
