import 'dotenv/config';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {selectDistributorAccounts} from '../server/utils/distributor-account-selection';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect(),schema='settings_supplier_test_'+randomUUID().replaceAll('-','');
const migration=(n:string)=>fs.readFileSync(new URL('../prisma/migrations/'+n+'/migration.sql',import.meta.url),'utf8');
async function tx<T>(fn:()=>Promise<T>){await c.query('BEGIN');try{await c.query(`SET LOCAL search_path TO "${schema}"`);const r=await fn();await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
const sql=(q:string,args:any[]=[])=>tx(()=>c.query(q,args));
try {
 await c.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');CREATE TABLE distributors(id text PRIMARY KEY,name text);
 CREATE TABLE distributor_companies(company_id text,distributor_id text,opening_due float DEFAULT 0,opening_due_date timestamp,PRIMARY KEY(distributor_id,company_id));
 CREATE TABLE money_transactions(id text PRIMARY KEY,company_id text,payment_mode text,account_id text,amount float,direction text DEFAULT 'RECEIVED',status text DEFAULT 'PAID',party_type text DEFAULT 'SUPPLIER');
 CREATE TABLE bank_accounts(id text PRIMARY KEY,company_id text,bank_name text);
 CREATE TABLE purchase_orders(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),total_amount float,tax float,payment_type text,bill_no text,purchase_order_no int,subtotal_amount float DEFAULT 0,discount float DEFAULT 0);
 CREATE TABLE purchase_returns(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),tax_amount float,return_no int);
 CREATE TABLE distributor_credits(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),amount float,remarks text,"billNo" text,credit_no int,purchase_order_id text,money_transaction_id text);
 CREATE TABLE distributor_payments(id text PRIMARY KEY,company_id text,distributor_id text,created_at timestamp DEFAULT now(),amount float,remarks text,payment_type text,payment_no int,purchase_return_id text,purchase_order_id text);
 INSERT INTO companies VALUES('a','INR');INSERT INTO distributors VALUES('vendor','Vendor');INSERT INTO distributor_companies VALUES('a','vendor',0,NULL);`);
 for(const n of ['20260926120000_accountant_v2','20260927120000_distributor_accounting','20260927123000_distributor_history_projection','20260927130000_distributor_purchase_tax','20260927133000_distributor_receipt_consistency','20261006120000_supplier_opening_account_default'])await sql(migration(n));
 await sql(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES
 ('payable','a','Payable','ACCOUNTS_PAYABLE','LIABILITY',now()),('supplier-opening','a','Supplier opening','EQUITY','EQUITY',now()),('company-opening','a','Company opening default','EQUITY','EQUITY',now()),
 ('supplier-cash','a','Supplier cash','CASH','ASSET',now()),('company-cash','a','Company cash default','CASH','ASSET',now());
 INSERT INTO accountant_v2_accountant_contact(id,company_id,name,type,updated_at) VALUES('contact','a','Vendor','VENDOR',now());
 INSERT INTO accountant_v2_distributor_settings(company_id,distributor_id,contact_id,enabled) VALUES('a','vendor','contact',true);
 INSERT INTO accountant_v2_distributor_mappings(company_id,distributor_id,role,account_id) VALUES('a','vendor','payable','payable'),('a','vendor','opening','supplier-opening'),('a','vendor','cash','supplier-cash');
 INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES('defaults','a','test','configured','account-defaults','purchase','{"opening":"company-opening","cash":"company-cash"}',now());
 UPDATE distributor_companies SET opening_due=100,opening_due_date=now() WHERE company_id='a' AND distributor_id='vendor';`);
 const opening=(await sql(`SELECT l.account_id,l.side,l.amount::text FROM accountant_v2_distributor_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id WHERE s.source_key='opening' ORDER BY l.account_id`)).rows;
 assert.ok(opening.some(l=>l.account_id==='company-opening'));assert.ok(!opening.some(l=>l.account_id==='supplier-opening'));
 await sql(`UPDATE accountant_v2_accountant_audit SET "after"='{"opening":"supplier-opening","cash":"company-cash"}' WHERE id='defaults'; UPDATE distributor_companies SET opening_due=150 WHERE company_id='a' AND distributor_id='vendor';`);
 const recorded=(await sql(`SELECT accounts FROM accountant_v2_distributor_sources WHERE source_key='opening'`)).rows[0];
 assert.equal(recorded.accounts.opening,'company-opening','Existing opening choice is frozen on later source edits');
 await tx(async()=>{
  await c.query("INSERT INTO distributor_payments(id,company_id,distributor_id,amount,payment_type) VALUES('payment','a','vendor',25,'CASH')");
  await selectDistributorAccounts(c,'a','vendor','payment:payment',undefined);
 });
 const payment=(await sql(`SELECT l.account_id,l.side,l.amount::text FROM accountant_v2_distributor_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id WHERE s.source_key='payment:payment' ORDER BY l.account_id`)).rows;
 assert.ok(payment.some(l=>l.account_id==='company-cash'));
 const result={at:new Date().toISOString(),method:'Native supplier projections/triggers and the actual account-selection helper in a disposable schema.',openingDefaultIgnored:false,openingLines:opening,paymentDefaultApplied:true,paymentLines:payment,
 explanation:'Company opening and Cash defaults reach first source postings; subsequent edits preserve the recorded opening account.'};
 fs.writeFileSync(`${process.env.ACCOUNTING_REVIEW_DIR||'scripts/production-accounting/runs/account-settings-review-2026-10-06'}/supplier-account-selection.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await c.query('ROLLBACK');await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);c.release();await pool.end();}
