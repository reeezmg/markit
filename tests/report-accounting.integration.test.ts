import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {accountingReport,accountingMoneyActivity,reportWindow,taxAccountingReport} from '../server/utils/report-accounting';
import {profitReport} from '../server/utils/report-profit';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect(),schema='reports_'+randomUUID().replaceAll('-','');
try{
 await db.query('BEGIN');await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET LOCAL search_path TO "${schema}"`);
 await db.query("CREATE TABLE companies(id text PRIMARY KEY,name text,currency text);INSERT INTO companies VALUES('a','Store A','INR'),('b','Store B','INR'),('foreign','Foreign','USD')");
 await db.query(readFileSync(new URL('../prisma/migrations/20260926120000_accountant_v2/migration.sql',import.meta.url),'utf8'));
 await db.query(`ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN distributor_id text,ADD COLUMN source_parties jsonb;
 CREATE TABLE accountant_v2_erp_settings(company_id text,accounts jsonb);
 CREATE TABLE accountant_v2_erp_sources(company_id text,source_key text,signature jsonb,accounts jsonb,journal_id text);
 CREATE TABLE accountant_v2_distributor_sources(company_id text,accounts jsonb);
 CREATE TABLE accountant_v2_distributor_mappings(company_id text,role text,account_id text);
 CREATE TABLE bills(id text,company_id text,invoice_number int,created_at timestamp,precedence boolean);
 CREATE TABLE categories(id text,name text);
 CREATE TABLE entries(id text,bill_id text,variant_id text,category_id text,name text,qty numeric,rate numeric,value numeric,tax numeric,return boolean);
 INSERT INTO categories VALUES('cat','Clothes');
 INSERT INTO bills VALUES('bill','a',1,'2026-01-02',false);
 INSERT INTO entries VALUES('entry','bill','variant','cat','Shirt',1,118,118,18,false);`);
 for(const [ident,type,category] of [['cash','CASH','ASSET'],['bank','BANK','ASSET'],['bank2','BANK','ASSET'],['ar','ACCOUNTS_RECEIVABLE','ASSET'],['stock','STOCK','ASSET'],['ap','ACCOUNTS_PAYABLE','LIABILITY'],['tax','OTHER_CURRENT_LIABILITY','LIABILITY'],['input','OTHER_CURRENT_ASSET','ASSET'],['sales','INCOME','INCOME'],['other','OTHER_INCOME','INCOME'],['expense','EXPENSE','EXPENSE'],['cogs','COST_OF_GOODS_SOLD','EXPENSE'],['equity','EQUITY','EQUITY']]){
  await db.query(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES($1,'a',$1,$2,$3,now())`,[ident,type,category]);
 }
 let serial=0;
 async function post(lines:any[],date='2026-01-02',type='MANUAL',options:any={}){const id='j'+(++serial);await db.query(`INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,source_type,exchange_rate,reversed_from_id,deleted_at,updated_at) VALUES($1,'a',$1,$2,'Fixture','INR',$3,$4,$5,$6,$7,$8,now())`,[id,date,lines.filter(l=>l[1]>0).reduce((s,l)=>s+l[1],0),options.status||'PUBLISHED',type,options.rate||1,options.parent||null,options.deleted?new Date():null]);for(const [account,amount]of lines)await db.query(`INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES($1,'a',$2,$3,$4,$5,now())`,[id+account,id,account,amount>0?'DEBIT':'CREDIT',Math.abs(amount)]);return id;}
 await post([['cash',100],['stock',200],['equity',-300]],'2026-01-01','OPENING_BALANCE');
 const bill=await post([['ar',118],['sales',-100],['tax',-18],['cogs',40],['stock',-40]],'2026-01-02','ERP_BILL');
 await db.query(`INSERT INTO accountant_v2_erp_sources VALUES('a','bill:bill','{"costs":{"entry:variant":40}}','{"outputTax":"tax","inputTax":"input"}',$1)`,[bill]);
 await db.query(`INSERT INTO accountant_v2_erp_settings VALUES('a','{"outputTax":"tax","inputTax":"input"}')`);
 await post([['bank2',118],['ar',-118]],'2026-01-03','MONEY_RECEIVE');
 await post([['expense',20],['ap',-20]],'2026-01-03','ERP_EXPENSE');
 await post([['bank',10],['cash',-10]],'2026-01-03','ACCOUNT_TRANSFER');
 const money=await post([['cash',5],['other',-5]],'2026-01-03','MONEY_RECEIVE');
 await post([['cash',-5],['other',5]],'2026-01-04','MONEY_REVERSAL',{parent:money});
 await post([['cash',1000],['sales',-1000]],'2026-01-03','MANUAL',{status:'DRAFT'});
 await post([['cash',1000],['sales',-1000]],'2026-01-03','MANUAL',{deleted:true});
 await post([['bank',2],['other',-2]],'2026-01-04','MANUAL',{rate:2});
 const from=new Date('2026-01-02Z'),to=new Date('2026-01-04T23:59:59Z');
 const r=await accountingReport(db,['a'],from,to);
 assert.equal(r.pnl.totalSales,100);assert.equal(r.pnl.totalCOGS,40);assert.equal(r.pnl.totalExpenses,20);assert.equal(r.pnl.otherIncome,4);assert.equal(r.pnl.netProfit,44);
 assert.equal(r.balances.total.opening,100);assert.equal(r.balances.total.closing,222);assert.equal(r.balances.receivable.closing,0);assert.equal(r.balances.bank.closing,132);assert.equal(r.balanceSheet.difference,0);
 assert.equal(r.cashFlow.net,122);assert.equal(r.cashFlow.received,127);assert.equal(r.cashFlow.paid,5);
 assert.equal(r.timeSeries.reduce((n:any,d:any)=>n+d.profit,0),44);
 const activity=await accountingMoneyActivity(db,['a'],from,to);assert.equal(activity.moneyTransactions.net,118);assert.equal(activity.transfersDisplay.reduce((n:any,d:any)=>n+d.net,0),0);
 const tax=await taxAccountingReport(db,'a',from,to);assert.equal(tax.outputTax,18);
 const profit=await profitReport(db,['a'],from,to);assert.deepEqual(profit.summary,r.pnl);assert.equal(profit.bills[0].billSales,100);assert.equal(profit.bills[0].entries[0].value,100);assert.equal(profit.bills[0].entries[0].cogs,40);
 assert.equal((await accountingReport(db,['b'],from,to)).accounts.length,0);
 await assert.rejects(accountingReport(db,['a','foreign'],from,to),/same base currency/);
 assert.throws(()=>reportWindow({from:'2026-01-03',to:'2026-01-02'}),/valid date/);
 assert.equal(reportWindow({startDate:'"2026-01-02T00:00:00.000Z"',endDate:'2026-01-03'}).from.toISOString(),'2026-01-02T00:00:00.000Z');
 console.log('PASS financial reporting: accrual credit sale, receipt without duplicate income, COGS, unpaid expense, all banks, transfers, reversals, draft/deleted exclusion, FX, opening/cutoff, tax mapping, source detail, company and currency isolation.');
}finally{await db.query('ROLLBACK');db.release();await pool.end()}
