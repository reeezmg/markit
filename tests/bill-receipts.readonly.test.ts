import 'dotenv/config'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { billSalesSql } from '../server/utils/report-bill-sales'
import { dailyReport, dailyExportReport } from '../server/utils/report-daily'
import { recordBillReceipt } from '../server/utils/bill-receipts'
import { gatherSummary } from '../server/utils/reportSummary'
import { pool as appPool } from '../server/db'

// SELECT-only fixtures are CTEs, not tables. Even the DML contract checks use
// EXPLAIN without ANALYZE inside a server-enforced read-only transaction.
const pool = new Pool({connectionString:process.env.DATABASE_URL}), client=await pool.connect()
const fixtures = `WITH fixture_bills AS (
  SELECT * FROM (VALUES
    ('bill','fixture',1000::float8,'Credit',NULL::jsonb,'PAID',false,false,false,'2026-10-01 04:30'::timestamp),
    ('split','fixture',1000::float8,'Split','[{"method":"Cash","amount":400},{"method":"Credit","amount":600}]'::jsonb,'PENDING',false,false,false,'2026-10-01 05:00'::timestamp),
    ('other','foreign',9999::float8,'Cash',NULL::jsonb,'PAID',false,false,false,'2026-10-01 04:30'::timestamp),
    ('cleaned','fixture',500::float8,'Credit',NULL::jsonb,'PENDING',false,false,true,'2026-10-01 05:00'::timestamp),
    ('unverified','fixture',700::float8,'UPI',NULL::jsonb,'PENDING',false,false,false,'2026-10-02 05:00'::timestamp)
  ) x(id,company_id,grand_total,payment_method,split_payments,payment_status,deleted,is_markit,precedence,created_at)
), fixture_payments AS (
  SELECT * FROM (VALUES ('r1','fixture','bill','UPI',400::float8),('r2','fixture','bill','UPI',600::float8),('other-r','foreign','other','Cash',9999::float8))
  x(id,company_id,bill_id,payment_mode,amount)
), fixture_journals AS (
  SELECT * FROM (VALUES
    ('fixture','r1','ERP_CREDIT_RECEIPT','PUBLISHED',NULL::timestamp,'2026-10-05 04:30'::timestamp),
    ('fixture','r2','ERP_CREDIT_RECEIPT','PUBLISHED',NULL::timestamp,'2026-10-06 04:30'::timestamp),
    ('fixture','r1','ERP_CREDIT_RECEIPT_REVERSAL','PUBLISHED',NULL::timestamp,'2026-10-06 05:00'::timestamp),
    ('foreign','other-r','ERP_CREDIT_RECEIPT','PUBLISHED',NULL::timestamp,'2026-10-06 05:00'::timestamp)
  ) x(company_id,source_id,source_type,status,deleted_at,journal_date)
), `
try {
  await client.query('BEGIN READ ONLY')
  const sql = fixtures + billSalesSql('b.grand_total').replace(/^WITH /,'')
    .replace(/\bbills\b/g,'fixture_bills').replace(/\bpayments\b/g,'fixture_payments').replace(/\baccountant_v2_manual_journals\b/g,'fixture_journals')
  const day=async(date:string,cleanup=false)=>(await client.query(sql,['fixture',date+'T00:00:00Z',date+'T23:59:59.999Z',cleanup])).rows[0]
  const sale=await day('2026-10-01')
  assert.equal(Number(sale.total_sales),2000);assert.equal(Number(sale.credit),1600);assert.equal(Number(sale.total_collections),400)
  const partial=await day('2026-10-05')
  assert.equal(Number(partial.total_sales),0);assert.equal(Number(partial.total_collections),400);assert.equal(Number(partial.collected_upi),400)
  assert.equal(Number((await day('2026-10-02')).total_collections),0,'Pending non-credit payments must not be counted as collected')
  const final=await day('2026-10-06')
  assert.equal(Number(final.total_sales),0);assert.equal(Number(final.total_collections),200);assert.equal(Number(final.credit_collections),200)
  const cleaned=await day('2026-10-01',true)
  assert.equal(Number(cleaned.total_sales),2500);assert.equal(Number(cleaned.credit),2100)
  const scopedSql = fixtures + billSalesSql('b.grand_total',true).replace(/^WITH /,'')
    .replace(/\bbills\b/g,'fixture_bills').replace(/\bpayments\b/g,'fixture_payments').replace(/\baccountant_v2_manual_journals\b/g,'fixture_journals')
  const scopedDay=async(ids:string[],date:string)=>(await client.query(scopedSql,[ids,date+'T00:00:00Z',date+'T23:59:59.999Z',false])).rows[0]
  assert.equal(Number((await scopedDay(['fixture'],'2026-10-05')).total_collections),400,'Selected dates include repayments for older bills')
  assert.equal(Number((await scopedDay(['fixture'],'2026-10-06')).total_collections),200,'Single-store scope excludes other stores and nets reversals')
  assert.equal(Number((await scopedDay(['fixture','foreign'],'2026-10-06')).total_collections),10199,'Multiple-store scope includes only selected stores')
  assert.equal(Number((await scopedDay([],'2026-10-06')).total_collections),0,'Empty scope cannot expose collections')
  console.log('Read-only SQL fixtures: invoice-date sales, split credit, dated partial/final collections, reversals, cleanup and company isolation passed')

  // Compile the actual receipt INSERT/UPDATE statements against the existing
  // schema, with EXPLAIN only; validation inputs are synthetic and never stored.
  const contracts:any[]=[]
  const db={async query(statement:string,args:any[]=[]):Promise<any>{
    if (statement.startsWith('SELECT') && !statement.includes('pg_advisory_xact_lock')) await client.query('EXPLAIN '+statement,args)
    const result=(rows:any[])=>({rows,rowCount:rows.length})
    if(statement.startsWith('SELECT * FROM bills'))return result([{id:'fixture-bill',company_id:'fixture-company',grand_total:100,payment_method:'Credit',payment_status:'PENDING',created_at:new Date('2026-10-01'),type:'BILL',invoice_number:1}])
    if(statement.startsWith('SELECT p.*, j.id') || statement.startsWith('SELECT "after"') || statement.startsWith('SELECT reason') || statement.includes('pg_advisory_xact_lock'))return result([])
    if(statement.startsWith('SELECT s.*, j.currency'))return result([{journal_id:'fixture-sale',signature:{},accounts:{receivable:'fixture-ar'},currency:'INR',journal_status:'PUBLISHED'}])
    if(statement.startsWith('SELECT sum(l.amount)'))return result([{amount:100,source_parties:{creditAccount:{id:'fixture-customer'}}}])
    if(statement.startsWith('SELECT id FROM accountant_v2_accounting_accounts'))return result([{id:'fixture-bank'}])
    if(/^(INSERT|UPDATE)\b/.test(statement)){await client.query('EXPLAIN '+statement,args);contracts.push(statement);return result([])}
    throw Error('Unknown contract query')
  }}
  await recordBillReceipt(db,'fixture-company','fixture-user',{billId:'fixture-bill',amount:100,paymentMethod:'UPI',accountId:'fixture-bank',paymentDate:'2026-10-05',requestId:'fixture-request'})
  assert.equal(contracts.length,6)
  await client.query(`EXPLAIN SELECT id FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND account_type=$2::"AccountantAccountingAccountType" AND is_active=true AND deleted_at IS NULL FOR SHARE`,['fixture-company','BANK'])
  const sourceFunction=(await client.query(`SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='accountant_v2_sync_erp'`)).rows[0]?.definition
  assert.ok(sourceFunction?.includes("IN ('PAID','PENDING')"),'ERP trigger must keep both pending and paid credit sales posted')
  assert.ok(sourceFunction?.includes('IF prev.signature=sig THEN RETURN 0'),'An unchanged financial signature must not reverse the sale')
  console.log('Read-only contract checks: existing receipt/journal columns, account type and ERP trigger stability passed')

  const companies=(await client.query('SELECT id FROM companies ORDER BY id LIMIT 3')).rows
  for(const {id} of companies) for(const cleanup of [false,true]) {
    const context={companyId:id,startDate:new Date('2026-10-01T00:00:00Z'),endDate:new Date('2026-10-06T23:59:59.999Z'),useOriginalCleanupValues:cleanup,includeCleanupPrecedence:cleanup}
    const daily=await dailyReport(client,context), exported=await dailyExportReport(client,context)
    assert.equal(daily.totalSales,exported.sales.total_sales)
    assert.equal(daily.totalCreditSales,exported.sales.credit)
    assert.equal(daily.totalCollections,exported.totalCollections)
    assert.deepEqual(daily.collectionsByPaymentMethod,exported.collectionsByPaymentMethod)
  }
  console.log(`Read-only connected reports: screen/export sales and collections agree for ${companies.length} companies in both cleanup modes`)
  const originalQuery=appPool.query
  try {
    (appPool as any).query=(sql:string,args:any[])=>client.query(sql,args)
    for (const cleanup of [false,true]) {
      const summary=await gatherSummary({companyId:companies[0].id,from:'2026-10-01T00:00:00Z',to:'2026-10-06T23:59:59.999Z',cleanup})
      assert.ok(summary.pendingCreditBills.every(b=>b.grandTotal>=0))
    }
    console.log('Read-only summary checks: current Credit/Split pending amounts compile and load in both cleanup modes')
  } finally {(appPool as any).query=originalQuery}
} finally {await client.query('ROLLBACK');client.release();await Promise.all([pool.end(),appPool.end()])}
