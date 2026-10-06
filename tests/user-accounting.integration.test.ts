import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
const url=new URL(process.env.DATABASE_URL!);
const pool=new Pool({connectionString:url.toString()}),db=await pool.connect();
const schema='user_accounting_test_'+randomUUID().replaceAll('-','');let prisma:any;
async function sql(text:string,args:any[]=[]){await db.query('BEGIN');try{await db.query(`SET LOCAL search_path TO "${schema}"`);const r=await db.query(text,args);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}}
const migration=(name:string)=>readFileSync(new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url),'utf8');
try{
 await db.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,name text,currency text DEFAULT 'INR');
 INSERT INTO companies(id,name) VALUES('a','Company A'),('b','Company B');
 CREATE TABLE company_users(company_id text,user_id text,name text,code text,deleted boolean DEFAULT false);
 INSERT INTO company_users(company_id,user_id,name) VALUES('a','staff','Staff'),('b','foreign','Foreign');
 CREATE TABLE bank_accounts(id text,company_id text,bank_name text);
 CREATE TABLE user_ledger_entries(id text PRIMARY KEY,company_id text,user_id text,type text,direction text,amount numeric,source_type text,source_id text,note text,created_at timestamp DEFAULT now(),balance_after numeric);
 CREATE TABLE salary_payments(id text PRIMARY KEY,company_id text,user_id text,amount numeric,payment_mode text,bank_account_id text,payment_date timestamp DEFAULT now());
 CREATE TABLE money_transactions(id text PRIMARY KEY,company_id text,party_type text,direction text,status text,amount numeric,payment_mode text,account_id text);
 CREATE TABLE accountant_v2_erp_settings(company_id text,accounts jsonb);
 CREATE TABLE accountant_v2_erp_sources(company_id text,source_key text,journal_id text);
 CREATE TABLE accountant_v2_distributor_mappings(company_id text,role text,account_id text);`);
 await sql(migration('20260926120000_accountant_v2'));
 await sql(`ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN source_parties jsonb;
 CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,b boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM accountant_v2_transaction_locks WHERE company_id=c AND is_locked AND module IN ('ALL','ACCOUNTS','BANKING') AND lock_date>=d) THEN RAISE EXCEPTION 'Locked'; END IF; END $$;`);
 await sql(migration('20260930130000_user_accounting'));
 await sql(migration('20260930131000_user_credit_cut_baseline'));
 url.searchParams.set('schema',schema);url.searchParams.set('statement_cache_size','0');process.env.DATABASE_URL=url.toString();
 prisma=(await import('../server/prisma')).prisma;
 const {runAccountant}=await import('../server/utils/accountant/context');
 const {enableUserAccounting,configureUserAccounting}=await import('../server/utils/accountant/users');
 const run=(fn:()=>Promise<any>)=>runAccountant({companyId:'a',userId:'manager',role:'manager'},fn,{lockCompany:true});
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('old','a','staff','PAYROLL_ACCRUAL','CREDIT',500,'PAYROLL_CYCLE','old-cycle:staff')");
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('old-cut','a','staff','CREDIT_BILL_PAYMENT','CREDIT',100,'PAYROLL','old-line')");
 const state=await run(enableUserAccounting);
 const balance=async(role:string)=>Number((await sql(`SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) n FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE l.account_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[state.mappings[role]])).rows[0].n);
 await sql("UPDATE user_ledger_entries SET amount=150 WHERE id='old-cut'");
 assert.equal(await balance('salaryPayable'),50,'Only additional cut on old cycle posts');assert.equal(await balance('receivable'),-50);
 await sql("DELETE FROM user_ledger_entries WHERE id='old-cut'");assert.equal(await balance('receivable'),0,'Deleting the cut reverses only new activity');
 await sql("UPDATE user_ledger_entries SET amount=600 WHERE id='old'");assert.equal(await balance('salaryPayable'),0,'Historical edits are excluded');
 await sql("DELETE FROM user_ledger_entries WHERE id='old'; INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('old-new-id','a','staff','PAYROLL_ACCRUAL','CREDIT',700,'PAYROLL_CYCLE','old-cycle:staff')");assert.equal(await balance('salaryPayable'),0,'Historical rerun with replacement ledger ID stays excluded');
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id,note) VALUES('accrual','a','staff','PAYROLL_ACCRUAL','CREDIT',1000,'PAYROLL_CYCLE','cycle:staff','Salary accrued')");
 assert.equal(await balance('salaryExpense'),1000);assert.equal(await balance('salaryPayable'),-1000);
 await sql("UPDATE user_ledger_entries SET amount=1200 WHERE id='accrual'");assert.equal(await balance('salaryExpense'),1200);
 await sql("INSERT INTO salary_payments(id,company_id,user_id,amount,payment_mode) VALUES('pay','a','staff',600,'CASH'); INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('payout','a','staff','SALARY_PAYMENT','DEBIT',800,'SALARY_PAYMENT','pay')");
 assert.equal(await balance('cash'),-600,'Only actual payout moves cash, not embedded credit cut');assert.equal(await balance('salaryPayable'),-600);
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('credit','a','staff','USER_CREDIT_BILL','DEBIT',300,'MANUAL',NULL); INSERT INTO money_transactions VALUES('credit','a','EMPLOYEE','GIVEN','PAID',300,'BANK',NULL)");
 assert.equal(await balance('receivable'),300);assert.equal(await balance('bank'),-300);
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('repay','a','staff','CREDIT_BILL_PAYMENT','CREDIT',50,'MANUAL',NULL); INSERT INTO money_transactions VALUES('repay','a','EMPLOYEE','RECEIVED','PAID',50,'CASH',NULL)");
 assert.equal(await balance('receivable'),250);assert.equal(await balance('cash'),-550);
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('cut','a','staff','CREDIT_BILL_PAYMENT','CREDIT',200,'PAYROLL','line'),('cut-salary','a','staff','SALARY_PAYMENT','DEBIT',200,'PAYROLL','line:salary-settlement')");
 assert.equal(await balance('receivable'),50);assert.equal(await balance('salaryPayable'),-400);assert.equal(await balance('cash'),-550,'Credit cut never moves cash');
 await sql("UPDATE user_ledger_entries SET amount=250 WHERE id='cut'");assert.equal(await balance('receivable'),0);assert.equal(await balance('salaryPayable'),-350);
 const count=Number((await sql('SELECT count(*) n FROM accountant_v2_manual_journals')).rows[0].n);
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('bill-credit','a','staff','USER_CREDIT_BILL','DEBIT',100,'BILL','invoice')");
 assert.equal(Number((await sql('SELECT count(*) n FROM accountant_v2_manual_journals')).rows[0].n),count,'Bill credit reuses ERP and does not repost revenue');
 await sql("UPDATE salary_payments SET amount=650,payment_mode='BANK' WHERE id='pay'");assert.equal(await balance('cash'),50);assert.equal(await balance('bank'),-950);
 await sql("UPDATE user_ledger_entries SET amount=80 WHERE id='repay'; UPDATE money_transactions SET amount=80 WHERE id='repay'");assert.equal(await balance('receivable'),-30);assert.equal(await balance('cash'),80);
 assert.equal((await sql("SELECT sum(accountant_v2_sync_user(company_id,id)) n FROM user_ledger_entries")).rows[0].n,'0','Unchanged sync is a no-op');
 await assert.rejects(sql("UPDATE user_ledger_entries SET user_id='foreign' WHERE id='credit'"),/does not belong/);
 await assert.rejects(sql("UPDATE money_transactions SET amount=900 WHERE id='credit'"),/inconsistent/);
 await assert.rejects(run(()=>configureUserAccounting({...state.mappings,cash:state.mappings.bank})),/Invalid company account/);
 await sql("INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,is_locked,updated_at,locked_by_id) VALUES('lock','a','ALL','2099-01-01','Closed',true,now(),'manager')");
 await assert.rejects(sql("DELETE FROM user_ledger_entries WHERE id='accrual'"),/Locked/);
 await sql("DELETE FROM accountant_v2_transaction_locks WHERE id='lock'");
 await sql("DELETE FROM user_ledger_entries WHERE id IN ('cut','cut-salary')");assert.equal(await balance('salaryPayable'),-550);assert.equal(await balance('receivable'),220);
 await sql("DELETE FROM user_ledger_entries WHERE id='payout'; DELETE FROM salary_payments WHERE id='pay'");assert.equal(await balance('bank'),-300);
 await sql("DELETE FROM user_ledger_entries WHERE id IN ('credit','repay','accrual'); DELETE FROM money_transactions");
 for(const role of ['salaryExpense','salaryPayable','cash','bank','receivable'])assert.equal(await balance(role),0,'Delete reverses '+role);
 assert.equal((await sql("SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0")).rowCount,0);
 assert.equal((await sql("SELECT id FROM accountant_v2_manual_journal_lines WHERE source_parties->'user'->>'id' IS DISTINCT FROM 'staff'")).rowCount,0,'Employee attribution survives reversals');
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('negative','a','staff','PAYROLL_ACCRUAL','DEBIT',40,'PAYROLL_CYCLE','negative-cycle:staff')");
 assert.equal(await balance('salaryExpense'),-40);assert.equal(await balance('salaryPayable'),40);
 await sql("DELETE FROM user_ledger_entries WHERE id='negative'");
 await sql("INSERT INTO bank_accounts VALUES('named','a','Named Bank'),('foreign-bank','b','Other Bank'); INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES('named-account','a','Named Bank','BANK','ASSET',now())");
 // Historical mapping roles are now discovered from source records, not the archived bank list.
 await sql("INSERT INTO salary_payments(id,company_id,user_id,amount,payment_mode,bank_account_id) VALUES('named-pay','a','staff',70,'BANK','named')");
 state.mappings['bank:named']='named-account';await run(()=>configureUserAccounting(state.mappings));
 await sql("INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES('named-payout','a','staff','SALARY_PAYMENT','DEBIT',70,'SALARY_PAYMENT','named-pay')");
 assert.equal(await balance('bank:named'),-70);assert.equal(await balance('bank'),0);
 await assert.rejects(sql("UPDATE salary_payments SET bank_account_id='foreign-bank' WHERE id='named-pay'"),/another company/);
 await sql("DELETE FROM user_ledger_entries WHERE id='named-payout'; DELETE FROM salary_payments WHERE id='named-pay'");assert.equal(await balance('bank:named'),0);
 // Exercise the real company-scoped ledger read and expose existing ERP bill journals.
 await sql(`WITH journal AS (INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,total,status,source_type,updated_at) VALUES('bill-journal','a','INV-1',now(),'Staff purchase',100,'PUBLISHED','ERP_BILL',now()) RETURNING id), lines AS (
 INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES('bill-debit','a','bill-journal',$1,'DEBIT',100,now()),('bill-credit','a','bill-journal',$2,'CREDIT',100,now()) RETURNING id)
 INSERT INTO accountant_v2_erp_sources VALUES('a','bill:invoice','bill-journal')`,[state.mappings.receivable,state.accounts.find((a:any)=>a.code==='4000').id]);
 const {createEvent}=await import('h3');const {Readable}=await import('node:stream');
 (globalThis as any).requireAuthSession=async()=>({data:{id:'manager',companyId:'a',role:'manager'}});
 const serverPool=(await import('../server/db')).pool;const originalConnect=serverPool.connect;
 (serverPool as any).connect=async()=>({query:sql,release(){}});
 try{
  const ledger=(await import('../server/api/users/ledger.get')).default;
  const req=Readable.from([]) as any;req.url='/api/users/ledger';req.method='GET';req.headers={'x-company-id':'a'};
  const event=createEvent(req,{} as any);event.context.authorizedCompanyIds=Promise.resolve(['a']);
  const users=await ledger(event) as any[];
  const staff=users.find(u=>u.userId==='staff');assert.ok(staff);
  const bill=staff.entries.find((e:any)=>e.id==='bill-credit');assert.equal(bill.journalId,'bill-journal');assert.equal(bill.accountingLines.length,2);assert.equal(bill.companyId,'a');
  assert.equal(staff.entries.find((e:any)=>e.id==='old-new-id').accountingStatus,'Before connection');
  req.headers['x-company-id']='b';await assert.rejects(ledger(event),/Company access denied/);
 }finally{serverPool.connect=originalConnect;await serverPool.end();}
 console.log('Staff accounting passed: new-only baseline, payroll accrual/edit, payout/edit, credits/repayments, noncash deductions, bill deduplication, source validation, locks, company scope, deletion, attribution and repeat no-op.');
}finally{
 if(prisma)await prisma.$disconnect();await sql(`DROP SCHEMA "${schema}" CASCADE`);db.release();await pool.end();
}
