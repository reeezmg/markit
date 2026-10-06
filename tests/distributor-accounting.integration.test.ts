import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const url=new URL(process.env.DATABASE_URL!);
const schema=`distributor_test_${randomUUID().replaceAll('-','')}`;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const connection=await pool.connect();
// Transaction poolers do not preserve session SET across statements.
const pg={async query(sql:string,args?:any[]) {
  await connection.query('BEGIN');
  try {
    await connection.query(`SET LOCAL search_path TO "${schema}"`);
    const result=await connection.query(sql,args);
    await connection.query('COMMIT');return result;
  } catch(e) {await connection.query('ROLLBACK');throw e;}
}};
let db:any;
try {
  await connection.query(`CREATE SCHEMA "${schema}"`);
  await pg.query(`
    CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');
    CREATE TABLE distributors(id text PRIMARY KEY,name text);
    CREATE TABLE distributor_companies(company_id text,distributor_id text,opening_due float DEFAULT 0,opening_due_date timestamp,PRIMARY KEY(distributor_id,company_id));
    CREATE TABLE money_transactions(id text PRIMARY KEY,company_id text,payment_mode text,account_id text,amount float,direction text DEFAULT 'RECEIVED',status text DEFAULT 'PAID',party_type text DEFAULT 'SUPPLIER');
    CREATE TABLE bank_accounts(id text PRIMARY KEY,company_id text,bank_name text);
    CREATE TABLE purchase_orders(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),total_amount float,tax float,payment_type text,bill_no text,purchase_order_no int,subtotal_amount float DEFAULT 0,discount float DEFAULT 0);
    CREATE TABLE purchase_returns(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),tax_amount float,return_no int);
    CREATE TABLE distributor_credits(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),amount float,remarks text,"billNo" text,credit_no int,purchase_order_id text,money_transaction_id text);
    CREATE TABLE distributor_payments(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),amount float,remarks text,payment_type text,payment_no int,purchase_return_id text,purchase_order_id text);
  `);
  for(const name of ['20260926120000_accountant_v2','20260927120000_distributor_accounting','20260927123000_distributor_history_projection','20260927130000_distributor_purchase_tax','20260927133000_distributor_receipt_consistency']) await pg.query(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8'));
  await pg.query('ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN source_parties jsonb');
  await pg.query(`INSERT INTO companies VALUES('a','INR'),('b','INR'); INSERT INTO distributors VALUES('vendor','Vendor');
    INSERT INTO distributor_companies VALUES('a','vendor',100,'2026-01-01'),('b','vendor',0,NULL);
    INSERT INTO purchase_orders VALUES('po','a','vendor','2026-02-01',1100,10,'CREDIT','B-1',1,1000,0);
    INSERT INTO distributor_credits(id,company_id,distributor_id,amount,purchase_order_id) VALUES('credit','a','vendor',1100,'po');
    INSERT INTO distributor_payments(id,company_id,distributor_id,amount,payment_type,created_at) VALUES('pay','a','vendor',400,'CASH','2026-02-02');
    INSERT INTO purchase_orders VALUES('cashpo','a','vendor','2026-02-03',200,0,'CASH',NULL,2,200,0);
    INSERT INTO distributor_payments(id,company_id,distributor_id,amount,payment_type,purchase_order_id,created_at) VALUES('cashpay','a','vendor',200,'CASH','cashpo','2026-02-03');
    INSERT INTO purchase_returns VALUES('ret','a','vendor','2026-02-04',10,1);
    INSERT INTO distributor_payments(id,company_id,distributor_id,amount,payment_type,purchase_return_id,created_at) VALUES('retpay','a','vendor',110,'RETURN','ret','2026-02-04');`);
  url.searchParams.set('schema',schema);url.searchParams.set('statement_cache_size','0');process.env.DATABASE_URL=url.toString();
  db=(await import('../server/prisma')).prisma;
  const {runAccountant,logActivity}=await import('../server/utils/accountant/context');
  const {distributorAccountingPreview:preview,configureDistributorAccounting:configure,importDistributorAccounting:backfill}=await import('../server/utils/accountant/distributors');
  const {accountingAccountRouter:accounts}=await import('../server/utils/accountant/accounts');
  const run=(fn:()=>Promise<any>,companyId='a')=>runAccountant({companyId,userId:'tester',role:'admin'},fn);
  const p=await run(()=>preview('vendor'));
  assert.equal(p.expectedBalance,690);assert.equal(p.legacyBalance,490);assert.equal(p.legacyDifference,200);
  const id=(type:string)=>p.accounts.find((a:any)=>a.accountType===type).id;
  const mappings={payable:id('ACCOUNTS_PAYABLE'),stock:id('STOCK'),cash:id('CASH'),tax:p.accounts.find((a:any)=>a.code==='1210').id,opening:p.accounts.find((a:any)=>a.code==='2220').id};
  // Prisma @updatedAt is application-managed; raw SQL must work without a DB default.
  await pg.query('ALTER TABLE accountant_v2_distributor_settings ALTER COLUMN updated_at DROP DEFAULT');
  const {distributorAccountingRouter}=await import('../server/utils/accountant/distributors');
  const identity={companyId:'a',userId:'tester',role:'manager'};
  await runAccountant(identity,async()=>{
    let result:any;
    const res={json(data:any){result=data;return res;},status(){return res;}};
    await distributorAccountingRouter.dispatch('PUT','/vendor',{user:identity,body:{mappings},query:{},params:{}},res);
    // Match the HTTP handler: dispatch and audit the full request identity in one transaction.
    await logActivity({...identity,action:'PUT',resource:'distributors',resourceId:'vendor',meta:{}});
    assert.equal(result.success,true);
  });
  const audit=(await pg.query("SELECT * FROM accountant_v2_accountant_audit WHERE action='PUT' AND resource='distributors' AND \"resourceId\"='vendor'")).rows;
  assert.equal(audit.length,1);
  assert.equal(audit[0].company_id,'a');
  assert.equal(audit[0].userId,'tester');
  const result=await run(()=>backfill('vendor'));
  assert.equal(result.postedBalance,690);assert.equal(result.changed,6);
  assert.equal((await run(()=>backfill('vendor'))).changed,0,'Repeated import is idempotent');
  await assert.rejects(run(()=>configure('vendor',mappings),'b'),'Cross company account mapping rejected');
  const totals=await pg.query(`SELECT sum(CASE WHEN side='DEBIT' THEN amount ELSE -amount END) AS total FROM accountant_v2_manual_journal_lines`);
  assert.equal(Number(totals.rows[0].total),0);
  // Edit reverses the previous journal, then posts the replacement atomically.
  await pg.query("UPDATE distributor_payments SET amount=450 WHERE id='pay'");
  assert.equal((await run(()=>preview('vendor'))).postedBalance,640);
  assert.equal(Number((await pg.query("SELECT count(*) FROM accountant_v2_manual_journals WHERE source_type='DISTRIBUTOR_REVERSAL'")).rows[0].count),1);
  await pg.query("DELETE FROM distributor_payments WHERE id='pay'");
  assert.equal((await run(()=>preview('vendor'))).postedBalance,1090);
  // Direct SQL and Prisma source writes both hit the deferred DB trigger.
  await pg.query("INSERT INTO distributor_credits(id,company_id,distributor_id,amount,created_at) VALUES('manual','a','vendor',80,'2026-02-05')");
  assert.equal((await run(()=>preview('vendor'))).postedBalance,1170);
  await assert.rejects(pg.query("UPDATE distributor_credits SET amount=-1 WHERE id='manual'"));
  assert.equal(Number((await pg.query("SELECT amount FROM distributor_credits WHERE id='manual'")).rows[0].amount),80);
  await pg.query(`INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,is_locked,updated_at,locked_by_id) VALUES('lock','a','ALL','2026-02-28','Closed',true,now(),'tester')`);
  await assert.rejects(pg.query("UPDATE distributor_credits SET amount=90 WHERE id='manual'"));
  assert.equal(Number((await pg.query("SELECT amount FROM distributor_credits WHERE id='manual'")).rows[0].amount),80);
  await pg.query("DELETE FROM accountant_v2_transaction_locks WHERE id='lock'");
  // Payable subaccounts can be selected; remapping does not rewrite history.
  let child:any;
  await run(async()=>{const res={json:(x:any)=>{child=x;return res;},status:()=>res};await accounts.dispatch('POST','/',{user:{companyId:'a',userId:'tester',role:'admin'},body:{name:'Vendor payable',accountType:'ACCOUNTS_PAYABLE',parentId:mappings.payable},query:{},params:{}},res);});
  await run(()=>configure('vendor',{...mappings,payable:child.id}));
  await pg.query("UPDATE distributor_credits SET amount=85 WHERE id='manual'");
  const previousAccount=(await pg.query(`SELECT s.accounts->>'payable' AS id FROM accountant_v2_distributor_sources s WHERE source_key='credit:manual'`)).rows[0].id;
  assert.equal(previousAccount,mappings.payable);
  await pg.query("INSERT INTO distributor_credits(id,company_id,distributor_id,amount,created_at) VALUES('new','a','vendor',50,'2026-03-01')");
  assert.equal((await pg.query("SELECT accounts->>'payable' AS id FROM accountant_v2_distributor_sources WHERE source_key='credit:new'")).rows[0].id,child.id);
  const {selectDistributorAccounts}=await import('../server/utils/distributor-account-selection');
  // An explicit transaction override replaces the current journal, preserving its reversal.
  await connection.query('BEGIN');
  await connection.query(`SET LOCAL search_path TO "${schema}"`);
  await selectDistributorAccounts(connection,'a','vendor','credit:manual',{payable:child.id});
  await connection.query("UPDATE distributor_credits SET remarks='Use dedicated payable' WHERE id='manual'");
  await connection.query('COMMIT');
  assert.equal((await pg.query("SELECT accounts->>'payable' AS id FROM accountant_v2_distributor_sources WHERE source_key='credit:manual'")).rows[0].id,child.id);
  await connection.query('BEGIN');
  await connection.query(`SET LOCAL search_path TO "${schema}"`);
  await assert.rejects(selectDistributorAccounts(connection,'a','vendor','credit:manual',{payable:mappings.stock}));
  await connection.query('ROLLBACK');
  // The tax stored on a PO is a percentage; 10% of 1,000 posts 100 input tax.
  assert.equal(Number((await pg.query(`SELECT sum(l.amount) AS amount FROM accountant_v2_manual_journal_lines l
    JOIN accountant_v2_distributor_sources s ON s.journal_id=l.journal_id
    WHERE s.source_key='purchase:po' AND l.account_id=$1`,[mappings.tax])).rows[0].amount),100);
  // Import must retain legacy credit ownership/amount rather than silently following a changed PO header.
  await pg.query("UPDATE purchase_orders SET distributor_id='another',total_amount=1500 WHERE id='po'");
  const preserved=await run(()=>preview('vendor'));
  assert.ok(preserved.warnings.some((w:string)=>w.includes('distributor differs')));
  assert.equal(Number(preserved.events.find((e:any)=>e.source_key==='purchase:po').amount),1100);
  assert.equal((await run(()=>backfill('vendor'))).changed,0);
  await pg.query(`INSERT INTO money_transactions(id,company_id,payment_mode,amount) VALUES('receipt','a','CASH',25);
    INSERT INTO distributor_credits(id,company_id,distributor_id,amount,money_transaction_id,created_at) VALUES('receipt-credit','a','vendor',25,'receipt','2026-03-03')`);
  await assert.rejects(pg.query("UPDATE money_transactions SET amount=30 WHERE id='receipt'"));
  await pg.query("UPDATE money_transactions SET amount=30 WHERE id='receipt'; UPDATE distributor_credits SET amount=30 WHERE id='receipt-credit'");
  await assert.rejects(pg.query("DELETE FROM money_transactions WHERE id='receipt'"));
  await pg.query("DELETE FROM distributor_credits WHERE id='receipt-credit'; DELETE FROM money_transactions WHERE id='receipt'");
  console.log('Distributor integration passed: import, reconciliation, cash purchases, tax, returns, idempotency, edit/delete reversals, rollback, locks, account choices and company isolation.');
} finally {
  await db?.$disconnect();
  await pg.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await connection.query('RESET search_path');
  connection.release();await pool.end();
}
