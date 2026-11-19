import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { pool } from '../server/db'
import { receiptBill } from '../server/utils/bill-receipts'
import { readSalesWorkflow } from '../server/utils/sales-workflow'
import { reversedReceiptStatus } from '../utils/bill-credit'

// Read-only verification of an explicitly saved demo; never seeds or cleans up.
const manifestPath=path.resolve(process.argv[2]||'../artifacts/after-sales-audit/blue-nest-saved-demo/Demo-Records.json')
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
assert.equal(manifest.status,'VERIFIED_PERSISTED','A committed demo manifest is required')
const company=manifest.companyId,report:any={companyId:company,companyName:manifest.companyName,verifiedAt:new Date().toISOString(),checks:[],counts:{}}
const originalConnect=pool.connect.bind(pool)
let db:any
const check=(description:string)=>report.checks.push(description)
try{
  db=await originalConnect()
  await db.query('BEGIN READ ONLY')
  const identity=(await db.query('SELECT id,name,status FROM companies WHERE id=$1',[company])).rows[0]
  assert(identity?.status&&identity.name===manifest.companyName)
  const actor=(await db.query(`SELECT user_id,role FROM company_users WHERE company_id=$1 AND status AND NOT deleted ORDER BY (role='admin') DESC,user_id LIMIT 1`,[company])).rows[0]
  assert(actor)
  ;(globalThis as any).requireAuthSession=async()=>({data:{id:actor.user_id,companyId:company,role:actor.role}})
  // The actual H3 GET handlers execute against fresh connections. Enforce a
  // read-only transaction even though the production wrapper starts with BEGIN.
  ;(pool as any).connect=async()=>{
    const connection=await originalConnect()
    return {release:()=>connection.release(),query:(sql:string,args?:any[])=>connection.query(sql==='BEGIN'?'BEGIN READ ONLY':sql,args)}
  }
  async function get(modulePath:string,query:any={},id?:string){
    const handler=(await import(modulePath)).default
    const req:any=Readable.from([])
    req.url='/api/after-sales?'+new URLSearchParams(query).toString();req.method='GET';req.headers={'x-company-id':company}
    const event=createEvent(req,{setHeader(){}} as any)
    event.context.authorizedCompanyIds=Promise.resolve([company])
    if(id)event.context.params={id}
    return handler(event)
  }
  const units=await get('../server/api/after-sales/products/index.get.ts',{q:manifest.prefix})
  assert.deepEqual(units.map((r:any)=>r.id).sort(),manifest.units.map((r:any)=>r.id).sort())
  check('Saved registered units are returned by the actual Products GET handler and DEMO-AS search')
  const details=[]
  for(const unit of manifest.units){
    const detail=await get('../server/api/after-sales/products/[id].get.ts',{},unit.id)
    assert.equal(detail.product.id,unit.id);assert.equal(detail.product.company_id,company)
    if(unit.id!==manifest.replacement.originalId)assert(detail.agreements.length>0)
    details.push(detail)
  }
  check('Every saved unit opens through the actual product-detail GET handler with its coverage and history')
  const jobs=await get('../server/api/after-sales/jobs/index.get.ts',{q:manifest.prefix})
  assert.deepEqual(jobs.map((r:any)=>r.id).sort(),manifest.jobs.map((r:any)=>r.id).sort())
  assert.equal(jobs.filter((r:any)=>r.bill_id).length,4)
  const due=await get('../server/api/after-sales/maintenance.get.ts',{q:manifest.prefix,status:'DUE'})
  assert(due.length>0);assert(due.some((r:any)=>r.job_status==='SCHEDULED'))
  const plans=await get('../server/api/after-sales/configurations/index.get.ts',{q:manifest.prefix})
  assert.equal(plans.length,manifest.plans.length)
  const catalog=await get('../server/api/after-sales/catalog/index.get.ts',{q:manifest.prefix})
  assert.equal(catalog.charges.length,1);assert.equal(catalog.products.length,1)
  check('Jobs, due maintenance, configurations and service-item GET handlers return the saved demo examples')
  let historyCount=0
  for(const client of manifest.customers){
    const history=await get('../server/api/after-sales/customers/[id].get.ts',{q:manifest.prefix,pageSize:'50'},client.id)
    const expected=units.filter((u:any)=>u.client_id===client.id).map((u:any)=>u.id).sort()
    assert.deepEqual(history.rows.filter((r:any)=>r.customer_product_id).map((r:any)=>r.customer_product_id).sort(),expected)
    historyCount+=history.total
  }
  check('All three demo clients show their registered purchases through the actual client service-history GET handler')
  const products=(await db.query('SELECT id FROM products WHERE company_id=$1 AND name LIKE $2',[company,manifest.prefix+'%'])).rows
  assert.deepEqual(products.map((r:any)=>r.id).sort(),manifest.products.map((r:any)=>r.id).sort())
  const stock=(await db.query('SELECT id,qty,initial_qty,sold_qty FROM items WHERE company_id=$1 AND id=ANY($2::text[])',[company,manifest.products.map((r:any)=>r.itemId)])).rows
  for(const item of stock)assert.equal(Number(item.qty),Number(item.initial_qty)-Number(item.sold_qty))
  const filterStock=stock.find((s:any)=>s.id===manifest.products[7].itemId)
  assert.equal(Number(filterStock.qty),29,'Paid visit consumes one filter')
  assert.equal(Number(stock.find((s:any)=>s.id===manifest.products[3].itemId).qty),19,'One of the two sold fridges was returned')
  assert.equal(Number(stock.find((s:any)=>s.id===manifest.products[6].itemId).qty),14,'Four sold units, one replacement and one delivery order consume six units')
  check('Committed stock balances include the exact-unit return, paid filter and free physical replacement')
  const returned=details.filter((d:any)=>d.product.status==='RETURNED')
  assert.equal(returned.length,1);assert(returned[0].agreements.every((a:any)=>a.status==='CANCELLED'))
  const original=details.find((d:any)=>d.product.id===manifest.replacement.originalId)
  const replacement=details.find((d:any)=>d.product.id===manifest.replacement.replacementId)
  assert.equal(original.product.status,'REPLACED');assert.equal(replacement.product.status,'ACTIVE')
  assert.equal(replacement.agreements.filter((a:any)=>a.status==='ACTIVE').length,3)
  assert(replacement.history.some((a:any)=>a.resource_id===original.product.id))
  const pendingDelivery=details.find((d:any)=>d.product.order_id===manifest.orders[0].id)
  assert.equal(pendingDelivery.agreements.length,3);assert(pendingDelivery.agreements.every((a:any)=>a.status==='PENDING'))
  const pendingInstallation=details.find((d:any)=>d.product.serial_number==='BN-DEMO-INSTALL-01')
  assert(pendingInstallation.agreements.every((a:any)=>a.status==='PENDING'))
  check('Return cancellation, carried replacement history and pending installation/delivery coverage remain saved')
  const paid=manifest.bills.find((b:any)=>b.label==='Maintenance Purifier')
  const partial=manifest.bills.find((b:any)=>b.label==='Complete Cover Air Conditioner')
  const fullState=await receiptBill(db,company,paid.id)
  assert.equal(fullState.outstanding,0);assert.equal(fullState.bill.payment_status,'PAID')
  const partialState=await receiptBill(db,company,partial.id)
  assert.equal(partialState.outstanding,15000);assert.equal(partialState.bill.payment_status,'PENDING')
  assert.equal(partialState.payments.length,2)
  assert(partialState.payments.some((p:any)=>p.status===reversedReceiptStatus))
  check('Full collection, partial collection and reversed receipt persist with correct invoice balances')
  const journals=(await db.query(`SELECT j.id,j.status,sum(CASE WHEN l.side='DEBIT' THEN l.amount ELSE -l.amount END)::text AS balance
    FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id
    WHERE j.company_id=$1 AND j.deleted_at IS NULL AND l.deleted_at IS NULL
      AND (j.id IN(SELECT s.journal_id FROM accountant_v2_erp_sources s WHERE s.company_id=$1 AND s.source_key=ANY($2::text[]))
        OR j.source_id=ANY($3::text[])) GROUP BY j.id,j.status`,[company,manifest.bills.map((b:any)=>'bill:'+b.id),manifest.receipts.map((r:any)=>r.id)])).rows
  assert(journals.length>0)
  for(const journal of journals){assert.equal(journal.status,'PUBLISHED');assert.equal(Number(journal.balance),0)}
  check('Published demo sale and receipt journals balance after commit')
  const baseline=JSON.parse(readFileSync(manifest.originalBackupFile||manifest.backupFile,'utf8'))
  assert.equal(baseline.companyId,company)
  for(const [table,rows] of Object.entries<any[]>(baseline.protected)){
    if(!rows.length)continue
    const actual=(await db.query(`SELECT id,md5(to_jsonb(t)::text) AS hash FROM ${table} t WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id`,[company,rows.map(r=>r.id)])).rows
    assert.deepEqual(actual,rows,`Original ${table} records remain unchanged`)
  }
  const settings=(await db.query('SELECT enabled FROM accountant_v2_erp_settings WHERE company_id=$1',[company])).rows[0]
  assert.equal(settings.enabled,true)
  const workflow=await readSalesWorkflow(db,company)
  assert.equal(workflow.includeAfterSales,true);assert.equal(workflow.includeInvoicing,true)
  check('Original protected records match the pre-change backup; ERP and invoicing remain enabled')
  report.counts={products:products.length,customers:manifest.customers.length,plans:plans.length,bills:manifest.bills.length,registeredUnits:units.length,jobs:jobs.length,dueMaintenance:due.length,orders:manifest.orders.length,receipts:manifest.receipts.length,journals:journals.length,clientHistoryRows:historyCount}
  report.result='PASS';report.scope='Committed database and actual after-sales GET handlers; authenticated staff context supplied locally, full app login/browser shell not exercised.'
  await db.query('COMMIT')
  writeFileSync(path.join(path.dirname(manifestPath),'Committed-Verification.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}catch(error:any){console.error(error.stack||error.message);process.exitCode=1}
finally{if(db){await db.query('ROLLBACK').catch(()=>{});db.release()};(pool as any).connect=originalConnect;await pool.end()}
