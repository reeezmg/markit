import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect(),schema='settings_stock_test_'+randomUUID().replaceAll('-','');
let prisma;
const migration=name=>fs.readFileSync(new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url),'utf8');
async function sql(q,args=[]){await c.query('BEGIN');try{await c.query(`SET LOCAL search_path TO "${schema}"`);const r=await c.query(q,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
try {
 await c.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');INSERT INTO companies VALUES('a','INR');
 CREATE TABLE bills(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),invoice_number int,grand_total numeric,payment_method text,payment_status text DEFAULT 'PAID',split_payments jsonb,deleted boolean DEFAULT false,is_markit boolean DEFAULT false,type text DEFAULT 'BILL',notes text);
 CREATE TABLE products(id text PRIMARY KEY,company_id text,name text,purchaseorder_id text);
 CREATE TABLE variants(id text PRIMARY KEY,company_id text,product_id text,p_price numeric);
 CREATE TABLE items(id text PRIMARY KEY,company_id text,variant_id text,qty int);
 CREATE TABLE entries(id text PRIMARY KEY,bill_id text,variant_id text,qty numeric,value numeric,tax numeric,return boolean DEFAULT false);
 CREATE TABLE expenses(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),expense_date timestamp DEFAULT now(),expense_number int,total_amount numeric,tax_amount numeric,payment_mode text,status text,note text,currency text);
 CREATE TABLE distributor_payments(id text PRIMARY KEY,company_id text,expense_id text);
 CREATE TABLE accountant_v2_distributor_sources(company_id text,distributor_id text,source_key text,accounts jsonb,journal_id text);
 INSERT INTO products VALUES('p','a','Unlinked product',NULL);INSERT INTO variants VALUES('v','a','p',40);INSERT INTO items VALUES('item','a','v',10);`);
 await sql(migration('20260926120000_accountant_v2'));
 await sql(`CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,b boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;`);
 await sql(migration('20260927150000_erp_accounting'));
 await sql(migration('20260929110000_stock_control'));
 await sql(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES
 ('stockA','a','Original inventory','STOCK','ASSET',now()),('stockB','a','Selected inventory','STOCK','ASSET',now()),
 ('cash','a','Cash','CASH','ASSET',now()),('bank','a','Bank','BANK','ASSET',now()),('receivable','a','Receivable','ACCOUNTS_RECEIVABLE','ASSET',now()),
 ('sales','a','Sales','INCOME','INCOME',now()),('outputTax','a','Output GST','OTHER_CURRENT_LIABILITY','LIABILITY',now()),
 ('cogs','a','COGS','COST_OF_GOODS_SOLD','EXPENSE',now()),('expense','a','Expense','EXPENSE','EXPENSE',now()),
 ('inputTax','a','Input GST','OTHER_CURRENT_ASSET','ASSET',now()),('expensePayable','a','Unpaid expenses','OTHER_CURRENT_LIABILITY','LIABILITY',now()),
 ('opening','a','Opening inventory','EQUITY','EQUITY',now()),('adjust','a','Inventory adjustment','EXPENSE','EXPENSE',now());
 INSERT INTO accountant_v2_erp_settings(company_id,enabled,activated_at,accounts) VALUES('a',true,'2000-01-01','{"cash":"cash","bank":"bank","receivable":"receivable","sales":"sales","outputTax":"outputTax","stock":"stockA","cogs":"cogs","expense":"expense","inputTax":"inputTax","expensePayable":"expensePayable"}');
 INSERT INTO accountant_v2_stock_control(company_id,stock_account_id,opening_account_id,adjustment_account_id,enabled) VALUES('a','stockA','opening','adjust',true);
 SELECT accountant_v2_sync_stock('a');`);
 const balances=async()=> (await sql(`SELECT a.id,coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)::text amount FROM accountant_v2_accounting_accounts a LEFT JOIN accountant_v2_manual_journal_lines l ON l.account_id=a.id WHERE a.id IN ('stockA','stockB','cogs','adjust') GROUP BY a.id ORDER BY a.id`)).rows;
 const before=await balances();
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);url.searchParams.set('statement_cache_size','0');process.env.DATABASE_URL=url.toString();
 prisma=(await import('../server/prisma.ts')).prisma;
 const {runAccountant}=await import('../server/utils/accountant/context.ts');
 const {configureErpAccounting}=await import('../server/utils/accountant/erp.ts');
 const saved=(await sql("SELECT accounts FROM accountant_v2_erp_settings WHERE company_id='a'")).rows[0].accounts;
 await runAccountant({companyId:'a',userId:'test',role:'manager'},()=>configureErpAccounting({...saved,stock:'stockB'}));
 await sql(`UPDATE items SET qty=9 WHERE id='item';
 INSERT INTO bills(id,company_id,grand_total,payment_method) VALUES('sale','a',118,'Cash');
 INSERT INTO entries VALUES('sale-entry','sale','v',1,118,18,false);`);
 const after=await balances();
 const posting=(await sql(`SELECT a.id,l.side,l.amount::text FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE s.source_key='bill:sale' ORDER BY a.id`)).rows;
 assert.ok(posting.some(l=>l.id==='stockB'&&l.side==='CREDIT'&&Number(l.amount)===40));
 assert.equal(Number(after.find(a=>a.id==='stockB').amount),360);assert.equal(Number(after.find(a=>a.id==='stockA').amount),0);
 assert.equal(Number(after.find(a=>a.id==='adjust').amount),0);
 const adjustments=(await sql(`SELECT l.account_id,l.side,l.amount::text FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id WHERE j.source_type='STOCK_CONTROL' AND j.entry_number<>'STK-1' ORDER BY j.entry_number,l.account_id`)).rows;
 const result={at:new Date().toISOString(),method:'Actual configureErpAccounting with Prisma, native ERP/stock-control functions and stock/source mutations in a disposable schema.',defect:false,
  selectedStock:'stockB',stockControlStock:'stockB',before,after,sourcePosting:posting,compensatingStockControlLines:adjustments,
  explanation:'Saving the ERP Stock selection moves default stock valuation to that account; the sale then reduces it by cost with no extra profit adjustment.'};
 fs.writeFileSync(`${process.env.ACCOUNTING_REVIEW_DIR||'scripts/production-accounting/runs/account-settings-review-2026-10-06'}/stock-account-selection.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await prisma?.$disconnect();await c.query('ROLLBACK');await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);c.release();await pool.end();}
