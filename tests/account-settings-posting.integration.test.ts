import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {accountDefaultGroups} from '../utils/account-defaults';
const url=new URL(process.env.DATABASE_URL!),schema='account_settings_test_'+randomUUID().replaceAll('-','');
const pool=new Pool({connectionString:url.toString()}),c=await pool.connect();let db:any;
async function sql(q:string,args:any[]=[]){await c.query('BEGIN');try{await c.query(`SET LOCAL search_path TO "${schema}"`);const r=await c.query(q,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
const migration=(name:string)=>readFileSync(new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url),'utf8');
try {
 await c.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');INSERT INTO companies(id) VALUES('a'),('b');
 CREATE TABLE bills(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),invoice_number int,account_id text,client_id text,user_id text,credit_user_id text,grand_total numeric,payment_method text,payment_status text DEFAULT 'PAID',split_payments jsonb,deleted boolean DEFAULT false,is_markit boolean DEFAULT false,type text DEFAULT 'BILL',notes text);
 CREATE TABLE accounts(id text PRIMARY KEY,company_id text,name text);
 CREATE TABLE clients(id text PRIMARY KEY,name text); CREATE TABLE company_clients(company_id text,client_id text);
 CREATE TABLE company_users(company_id text,user_id text,name text,deleted boolean DEFAULT false);
 INSERT INTO company_users VALUES('a','staff','Staff',false);
 CREATE TABLE variants(id text PRIMARY KEY,p_price numeric);INSERT INTO variants VALUES('v',40);
 CREATE TABLE entries(id text PRIMARY KEY,bill_id text,variant_id text,qty numeric,value numeric,tax numeric,return boolean DEFAULT false);
 CREATE TABLE expenses(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),expense_date timestamp DEFAULT now(),expense_number int,from_id text,total_amount numeric,tax_amount numeric,payment_mode text,status text,note text,currency text DEFAULT 'INR');
 CREATE TABLE distributor_payments(id text PRIMARY KEY,company_id text,expense_id text);
 CREATE TABLE distributors(id text PRIMARY KEY,name text); CREATE TABLE distributor_companies(company_id text,distributor_id text);
 CREATE TABLE accountant_v2_distributor_mappings(company_id text,role text,account_id text);
 CREATE TABLE bank_accounts(id text PRIMARY KEY,company_id text,bank_name text);INSERT INTO bank_accounts VALUES('secondary','a','Secondary');
 CREATE TABLE user_ledger_entries(id text PRIMARY KEY,company_id text,user_id text,type text,direction text,amount numeric,source_type text,source_id text,note text,created_at timestamp DEFAULT now(),balance_after numeric);
 CREATE TABLE salary_payments(id text PRIMARY KEY,company_id text,user_id text,amount numeric,payment_mode text,bank_account_id text,payment_date timestamp DEFAULT now());
 CREATE TABLE money_transactions(id text PRIMARY KEY,company_id text,party_type text,direction text,status text,amount numeric,payment_mode text,account_id text);`);
 await sql(migration('20260926120000_accountant_v2'));
 await sql(`ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN distributor_id text;
 CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,b boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;`);
 for(const m of ['20260927150000_erp_accounting','20260927151000_erp_deleted_source_stability','20260927160000_expense_tax_recovery','20260927170000_erp_party_links','20260930130000_user_accounting'])await sql(migration(m));
 url.searchParams.set('schema',schema);url.searchParams.set('statement_cache_size','0');process.env.DATABASE_URL=url.toString();
 db=(await import('../server/prisma')).prisma;
 const {runAccountant}=await import('../server/utils/accountant/context');
 const {erpRoles,configureErpAccounting,enableErpAccounting}=await import('../server/utils/accountant/erp');
 const {userAccountRoles,configureUserAccounting,enableUserAccounting}=await import('../server/utils/accountant/users');
 const {accountSettingsRouter}=await import('../server/utils/accountant/account-settings');
 const run=(fn:()=>Promise<any>,companyId='a',role='manager')=>runAccountant({companyId,userId:'reviewer',role},fn);
 async function call(method:string,path:string,body:any={},companyId='a',role='manager'){return run(async()=>{let result:any;await accountSettingsRouter.dispatch(method,path,{user:{companyId,userId:'reviewer',role},body,params:{},query:{}},{json:(v:any)=>result=v,status:()=>{}});return result;},companyId,role);}
 const make=async(id:string,type:string,company='a')=>{const category=['INCOME','OTHER_INCOME'].includes(type)?'INCOME':['EXPENSE','OTHER_EXPENSE','COST_OF_GOODS_SOLD'].includes(type)?'EXPENSE':type==='EQUITY'?'EQUITY':type.includes('LIABILITY')||type==='ACCOUNTS_PAYABLE'?'LIABILITY':'ASSET';await sql('INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES($1,$2,$1,$3,$4,now())',[id,company,type,category]);return id;};
 const erpA:any={},erpB:any={},staffA:any={},staffB:any={};
 for(const [role,spec] of Object.entries(erpRoles)){erpA[role]=await make('erpA-'+role,spec.type);erpB[role]=await make('erpB-'+role,spec.type);}
 for(const [role,spec] of Object.entries(userAccountRoles)){staffA[role]=await make('staffA-'+role,spec.type);staffB[role]=await make('staffB-'+role,spec.type);}
 staffA['bank:secondary']=await make('staffA-secondary','BANK');staffB['bank:secondary']=await make('staffB-secondary','BANK');
 // Historical role validation comes from a source payment, never an old-bank picker.
 await sql("INSERT INTO salary_payments(id,company_id,user_id,amount,payment_mode,bank_account_id) VALUES('historical-bank-reference','a','staff',1,'BANK','secondary')");
 await run(()=>configureErpAccounting(erpA));await run(enableErpAccounting);
 await run(()=>configureUserAccounting(staffA));await run(enableUserAccounting);
 const lines=async(table:string,key:string)=> (await sql(`SELECT l.account_id,l.side,l.amount::text FROM ${table} s JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id WHERE s.company_id='a' AND s.source_key=$1 ORDER BY l.account_id,l.side`,[key])).rows;
 const expect=async(table:string,key:string,expected:[string,string,number][])=>assert.deepEqual(await lines(table,key),expected.map(([account_id,side,n])=>({account_id,side,amount:n.toFixed(2)})).sort((a,b)=>a.account_id.localeCompare(b.account_id)||a.side.localeCompare(b.side)),key);
 const bill=async(id:string,method:string,status='PAID')=>sql(`INSERT INTO bills(id,company_id,grand_total,payment_method,payment_status) VALUES($1,'a',118,$2,$3);`,[id,method,status]);
 await bill('cash','Cash');await sql("INSERT INTO entries VALUES('cash-entry','cash','v',1,118,18,false)");
 await expect('accountant_v2_erp_sources','bill:cash',[[erpA.cash,'DEBIT',118],[erpA.sales,'CREDIT',100],[erpA.outputTax,'CREDIT',18],[erpA.stock,'CREDIT',40],[erpA.cogs,'DEBIT',40]]);
 await bill('bank','UPI');await expect('accountant_v2_erp_sources','bill:bank',[[erpA.bank,'DEBIT',118],[erpA.sales,'CREDIT',118]]);
 await bill('credit','Credit','PENDING');await expect('accountant_v2_erp_sources','bill:credit',[[erpA.receivable,'DEBIT',118],[erpA.sales,'CREDIT',118]]);
 await sql("INSERT INTO expenses(id,company_id,total_amount,tax_amount,recoverable_tax_amount,payment_mode,status) VALUES('expense','a',110,10,4,'BANK','Pending')");
 await expect('accountant_v2_erp_sources','expense:expense',[[erpA.expense,'DEBIT',106],[erpA.inputTax,'DEBIT',4],[erpA.expensePayable,'CREDIT',110]]);
 await sql("UPDATE expenses SET status='Paid' WHERE id='expense'");await expect('accountant_v2_erp_sources','expense:expense',[[erpA.expense,'DEBIT',106],[erpA.inputTax,'DEBIT',4],[erpA.bank,'CREDIT',110]]);
 await run(()=>configureErpAccounting(erpB));
 await sql("UPDATE bills SET grand_total=236 WHERE id='cash';UPDATE entries SET qty=2,value=236 WHERE id='cash-entry'");
 await expect('accountant_v2_erp_sources','bill:cash',[[erpA.cash,'DEBIT',236],[erpA.sales,'CREDIT',200],[erpA.outputTax,'CREDIT',36],[erpA.stock,'CREDIT',80],[erpA.cogs,'DEBIT',80]]);
 await bill('new-cash','Cash');await expect('accountant_v2_erp_sources','bill:new-cash',[[erpB.cash,'DEBIT',118],[erpB.sales,'CREDIT',118]]);
 console.log('PASS all 10 ERP mapping roles: cash/bank/receivable/sales/output tax/stock/COGS/expense/input tax/unpaid expense; changed defaults affect new sources and preserve existing sources.');
 const ledger=async(id:string,type:string,direction:string,amount:number,sourceType:string,sourceId:string|null)=>sql('INSERT INTO user_ledger_entries(id,company_id,user_id,type,direction,amount,source_type,source_id) VALUES($1,\'a\',\'staff\',$2,$3,$4,$5,$6)',[id,type,direction,amount,sourceType,sourceId]);
 await ledger('accrual','PAYROLL_ACCRUAL','CREDIT',1000,'PAYROLL_CYCLE','cycle:staff');
 const userKey=(await sql("SELECT source_key FROM accountant_v2_user_sources WHERE ledger_id='accrual'")).rows[0].source_key;
 await expect('accountant_v2_user_sources',userKey,[[staffA.salaryExpense,'DEBIT',1000],[staffA.salaryPayable,'CREDIT',1000]]);
 for(const [id,mode,bank,account] of [['cashpay','CASH',null,staffA.cash],['bankpay','BANK',null,staffA.bank],['namedpay','BANK','secondary',staffA['bank:secondary']]]){
  await sql("INSERT INTO salary_payments(id,company_id,user_id,amount,payment_mode,bank_account_id) VALUES($1,'a','staff',100,$2,$3)",[id,mode,bank]);
  await ledger(id+'-ledger','SALARY_PAYMENT','DEBIT',100,'SALARY_PAYMENT',id);
  const key=(await sql('SELECT source_key FROM accountant_v2_user_sources WHERE ledger_id=$1',[id+'-ledger'])).rows[0].source_key;
  await expect('accountant_v2_user_sources',key,[[staffA.salaryPayable,'DEBIT',100],[account,'CREDIT',100]]);
 }
 await sql("INSERT INTO money_transactions VALUES('credit','a','EMPLOYEE','GIVEN','PAID',50,'CASH',NULL)");await ledger('credit','USER_CREDIT_BILL','DEBIT',50,'MANUAL',null);
 const creditKey=(await sql("SELECT source_key FROM accountant_v2_user_sources WHERE ledger_id='credit'")).rows[0].source_key;
 await expect('accountant_v2_user_sources',creditKey,[[staffA.receivable,'DEBIT',50],[staffA.cash,'CREDIT',50]]);
 await ledger('opening','OPENING','CREDIT',30,'MANUAL',null);
 const openingKey=(await sql("SELECT source_key FROM accountant_v2_user_sources WHERE ledger_id='opening'")).rows[0].source_key;
 await expect('accountant_v2_user_sources',openingKey,[[staffA.opening,'DEBIT',30],[staffA.salaryPayable,'CREDIT',30]]);
 await run(()=>configureUserAccounting(staffB));await sql("UPDATE user_ledger_entries SET amount=1200 WHERE id='accrual'");
 // Disconnect a historical salary's old scalar link while preserving its native bank.
 const {selectStaffPaymentAccount}=await import('../server/utils/staff-payment-account');
 await c.query('BEGIN');
 try {
  await c.query(`SET LOCAL search_path TO "${schema}"`);
  await c.query("UPDATE salary_payments SET bank_account_id=NULL,amount=125 WHERE id='namedpay'");
  await c.query("UPDATE user_ledger_entries SET amount=125 WHERE id='namedpay-ledger'");
  await selectStaffPaymentAccount(c,'a','BANK',null,'namedpay-ledger','secondary');
  await c.query('COMMIT');
 } catch(e) {await c.query('ROLLBACK');throw e;}
 const namedKey=(await sql("SELECT source_key FROM accountant_v2_user_sources WHERE ledger_id='namedpay-ledger'")).rows[0].source_key;
 await expect('accountant_v2_user_sources',namedKey,[[staffA.salaryPayable,'DEBIT',125],[staffA['bank:secondary'],'CREDIT',125]]);
 await expect('accountant_v2_user_sources',userKey,[[staffA.salaryExpense,'DEBIT',1200],[staffA.salaryPayable,'CREDIT',1200]]);
 await ledger('new-accrual','PAYROLL_ACCRUAL','CREDIT',200,'PAYROLL_CYCLE','newcycle:staff');
 const newKey=(await sql("SELECT source_key FROM accountant_v2_user_sources WHERE ledger_id='new-accrual'")).rows[0].source_key;
 await expect('accountant_v2_user_sources',newKey,[[staffB.salaryExpense,'DEBIT',200],[staffB.salaryPayable,'CREDIT',200]]);
 console.log('PASS six staff roles plus named-bank selection; changed settings preserve old accrual mappings and apply to new accruals.');
 const typeIds:any={};const getType=async(type:string)=>typeIds[type]||=(await make('default-'+type,type));
 let fields=0;
 for(const [group,spec] of Object.entries(accountDefaultGroups)){
  const mappings:any={};
  for(const [role,field] of Object.entries(spec.fields)){mappings[role]=await getType(field.types?.[0]||'INCOME');fields++;}
  if(group==='transfers')mappings.toAccountId=await make('transfer-destination','BANK');
  await call('PUT','/'+group,{mappings});assert.deepEqual((await call('GET','/defaults')).defaults[group],mappings);
  assert.equal((await call('GET','/defaults',{},'b')).defaults[group],undefined);
  await call('PUT','/'+group,{mappings:{}});assert.deepEqual((await call('GET','/defaults')).defaults[group],{});
 }
 await make('foreign','CASH','b');await make('inactive','CASH');await sql("UPDATE accountant_v2_accounting_accounts SET is_active=false WHERE id='inactive'");
 for(const id of ['foreign','inactive',erpA.sales])await assert.rejects(call('PUT','/receive',{mappings:{moneyAccountId:id}}));
 for(const role of ['admin','manager','accountant'])await call('PUT','/receive',{mappings:{moneyAccountId:erpA.cash}},'a',role);
 await assert.rejects(call('PUT','/receive',{mappings:{moneyAccountId:erpA.cash}},'a','user'));
 await assert.rejects(call('PUT','/transfers',{mappings:{fromAccountId:erpA.cash,toAccountId:erpA.cash}}));
 await assert.rejects(run(()=>configureErpAccounting(erpA),'b'));await assert.rejects(run(()=>configureUserAccounting(staffA),'b'));
 console.log(`PASS ${fields} form-default selectors across all six groups: save/read/clear, company isolation, activity/type validation, roles and distinct transfers.`);
 assert.equal((await sql("SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0")).rowCount,0);
 console.log('PASS every fixture journal balanced. Isolated schema is removed in finally; no production source/settings rows changed.');
} finally {await db?.$disconnect();await c.query('ROLLBACK');await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);c.release();await pool.end();}
