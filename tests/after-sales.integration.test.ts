import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Pool } from 'pg'
import { defaultServiceRules, serviceToday, addServiceDate } from '../utils/after-sales'
import { afterSalesAvailable, serviceLock } from '../server/utils/after-sales-lifecycle'
import { saveConfiguration, previewConfiguration, registerManualProduct, serviceProductDetail, saveServiceJob, updateCustomerProduct } from '../server/utils/after-sales'
import { customerServiceHistory } from '../server/utils/after-sales-customer-history'
import { ensureServiceChargeCategory } from '../server/utils/after-sales-charge-category'
import { productNumberingAvailable, nextCustomerProductReference } from '../server/utils/customer-product-numbering'

// No schema creation, migrations, committed fixtures or edits to existing records.

test('installed product numbering serializes allocation and rolls counters back (no DDL)', async t => {
 if(!process.env.DATABASE_URL){t.skip('DATABASE_URL is not configured.');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2}),first=await pool.connect(),second=await pool.connect()
 let pending:Promise<string>|undefined
 try{
  await first.query('BEGIN');await second.query('BEGIN');await second.query("SET LOCAL lock_timeout='10s'")
  if(!await productNumberingAvailable(first)){t.skip('Customer product numbering migration must be separately installed; no schema changes made.');return}
  const company=(await first.query('SELECT id FROM companies WHERE status=true ORDER BY id LIMIT 1')).rows[0]?.id
  if(!company){t.skip('An active company is required.');return}
  const reference=await nextCustomerProductReference(first,company,'rollback-unit')
  let finished=false
  pending=nextCustomerProductReference(second,company,'other-rollback-unit').finally(()=>{finished=true})
  await first.query('SELECT pg_sleep(0.15)');assert.equal(finished,false)
  await first.query('ROLLBACK');assert.equal(await pending,reference,'Rolled-back allocation does not consume a number')
  assert.notEqual(await nextCustomerProductReference(second,company,'third-rollback-unit'),reference)
 }finally{
  await first.query('ROLLBACK');if(pending)await pending.catch(()=>{})
  await second.query('ROLLBACK');first.release();second.release();await pool.end()
 }
})

test('concurrent service category requests serialize on the installed schema (rollback only)', async t => {
 if(!process.env.DATABASE_URL){t.skip('DATABASE_URL is not configured.');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2}),first=await pool.connect(),second=await pool.connect()
 let pending:Promise<any>|undefined
 try{
  await first.query('BEGIN');await second.query('BEGIN')
  await second.query("SET LOCAL lock_timeout='10s'")
  if(!await afterSalesAvailable(first)){t.skip('After-sales must already be installed.');return}
  const company=(await first.query('SELECT id FROM companies WHERE status=true ORDER BY id LIMIT 1')).rows[0]?.id
  if(!company){t.skip('An active company is required.');return}
  const category=await ensureServiceChargeCategory(first,company,'rollback-test')
  assert.equal((await ensureServiceChargeCategory(first,company,'rollback-test')).id,category.id)
  let finished=false
  pending=ensureServiceChargeCategory(second,company,'rollback-test').finally(()=>{finished=true})
  // Give the second connection time to reach the held transaction advisory lock.
  await first.query('SELECT pg_sleep(0.15)')
  assert.equal(finished,false,'Concurrent category request waits for the owning transaction')
  await first.query('ROLLBACK')
  const next=await pending
  assert.equal((await ensureServiceChargeCategory(second,company,'rollback-test')).id,next.id)
  assert.equal((await second.query('SELECT count(*)::int AS count FROM categories WHERE id=$1 AND company_id=$2',[next.id,company])).rows[0].count,1)
 }finally{
  await first.query('ROLLBACK')
  if(pending)await pending.catch(()=>{})
  await second.query('ROLLBACK');first.release();second.release();await pool.end()
 }
})
// Every test write targets run-owned after-sales rows and rolls back as one unit.

test('customer-product detail reads installed records and isolates tenants (read only)',async t=>{
 if(!process.env.DATABASE_URL){t.skip('DATABASE_URL is not configured.');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1}),db=await pool.connect()
 try{
  await db.query('BEGIN READ ONLY')
  if(!await afterSalesAvailable(db)){t.skip('After-sales tables are not installed.');return}
  const unit=(await db.query('SELECT id,company_id FROM customer_products ORDER BY created_at DESC,id LIMIT 1')).rows[0]
  if(!unit){t.skip('An existing registered customer product is required.');return}
  const detail=await serviceProductDetail(db,unit.company_id,unit.id)
  assert.equal(detail.product.id,unit.id)
  assert.equal(detail.product.company_id,unit.company_id)
  for(const collection of [detail.agreements,detail.jobs,detail.readings,detail.history]){
   assert.ok(Array.isArray(collection))
   assert.ok(collection.every((row:any)=>row.company_id===unit.company_id))
  }
  for(const reading of detail.readings)assert.match(reading.recorded_on,/^\d{4}-\d{2}-\d{2}$/)
  const dates=detail.readings.map((reading:any)=>reading.recorded_on)
  assert.deepEqual(dates,[...dates].sort().reverse())
  const purchases=await customerServiceHistory(db,unit.company_id,{id:detail.product.client_id,q:detail.product.reference})
  assert.equal(purchases.customer.id,detail.product.client_id)
  assert.equal(purchases.rows[0]?.customer_product_id,unit.id)
  assert.equal(purchases.total,1)
  const empty=await customerServiceHistory(db,unit.company_id,{id:detail.product.client_id,q:randomUUID()})
  assert.deepEqual(empty.rows,[]);assert.equal(empty.total,0)
  await assert.rejects(customerServiceHistory(db,randomUUID(),{id:detail.product.client_id}),{statusCode:404})
  await assert.rejects(customerServiceHistory(db,unit.company_id,{id:detail.product.client_id,pageSize:999}),{statusCode:400})
  await assert.rejects(serviceProductDetail(db,randomUUID(),unit.id),(error:any)=>error.statusCode===404)
 }finally{await db.query('ROLLBACK');db.release();await pool.end()}
})

test('installed after-sales SQL lifecycle and tenant boundaries (rollback only)',async t=>{
 if(!process.env.DATABASE_URL){t.skip('DATABASE_URL is not configured.');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1}),db=await pool.connect()
 try{
  await db.query('BEGIN')
  if(!await afterSalesAvailable(db)){t.skip('Prepared after-sales migration has not been installed; no feature writes executed.');return}
  const member=(await db.query(`SELECT cc.company_id,cc.client_id FROM company_clients cc JOIN companies c ON c.id=cc.company_id
    JOIN clients cl ON cl.id=cc.client_id WHERE c.status=true AND cl.deleted=false ORDER BY cc.company_id,cc.client_id LIMIT 1`)).rows[0]
  if(!member){t.skip('An active company with a linked customer is required.');return}
  const company=member.company_id,actor='after-sales-rollback-test',run=randomUUID(),today=serviceToday()
  await serviceLock(db,company)
  const w=await saveConfiguration(db,company,actor,{kind:'WARRANTY',name:'Rollback warranty '+run,rules:defaultServiceRules()})
  const m=await saveConfiguration(db,company,actor,{kind:'MAINTENANCE',name:'Rollback maintenance '+run,rules:{...defaultServiceRules(),frequency:'DAY',interval:1,freeVisits:1,charge:150,
    fields:[{key:'reading',label:'Reading',type:'NUMBER',unit:'hours',required:true}]}})
  const input={clientId:member.client_id,name:'Rollback unit '+run,purchasedOn:addServiceDate(today,-1,'DAY'),evidence:'In-memory rollback fixture',configurationIds:[w.id,m.id],requestKey:run}
  const first=await registerManualProduct(db,company,actor,input)
  assert.equal((await registerManualProduct(db,company,actor,input)).id,first.id)
  const second=await registerManualProduct(db,company,actor,{...input,requestKey:run+'-second',serialNumber:'TEST-'+run})
  assert.notEqual(first.id,second.id)
  let detail=await serviceProductDetail(db,company,first.id)
  assert.equal(detail.agreements.length,2);assert.equal(detail.product.serial_number,null)
  assert.equal(detail.agreements.find((a:any)=>a.kind==='WARRANTY').status,'ACTIVE')
  await assert.rejects(serviceProductDetail(db,'different-company',first.id),/not found/)
  const agreement=detail.agreements.find((a:any)=>a.kind==='MAINTENANCE')
  const jobInput={agreementId:agreement.id,requestKey:run+'-visit',status:'COMPLETED',completedOn:today,details:{notes:'Test complete',values:{reading:123}}}
  const job=await saveServiceJob(db,company,actor,jobInput)
  assert.equal((await saveServiceJob(db,company,actor,jobInput)).id,job.id)
  detail=await serviceProductDetail(db,company,first.id)
  assert.equal(detail.agreements.find((a:any)=>a.id===agreement.id).completed_visits,1)
  assert.equal(detail.jobs[0].charge,0);assert.equal(detail.jobs[0].bill_id,null)
  const paid=await saveServiceJob(db,company,actor,{...jobInput,requestKey:run+'-paid',status:'SCHEDULED'})
  detail=await serviceProductDetail(db,company,first.id)
  assert.equal(detail.jobs.find((j:any)=>j.id===paid.id).charge,150)
  await updateCustomerProduct(db,company,actor,{id:first.id,action:'READING',reason:'Rollback measurement',agreementId:agreement.id,recordedOn:today,values:{reading:124}})
  const edit={id:m.id,revision:m.revision,kind:'MAINTENANCE',name:'Amended rollback '+run,rules:{...agreement.snapshot.rules,interval:2},applyTo:'SELECTED',reason:'Explicit test amendment',agreementIds:[agreement.id]}
  const preview=await previewConfiguration(db,company,edit)
  assert.ok(preview.agreements.some((a:any)=>a.id===agreement.id))
  await saveConfiguration(db,company,actor,{...edit,previewToken:preview.token})
  detail=await serviceProductDetail(db,company,first.id)
  assert.equal(detail.agreements.find((a:any)=>a.id===agreement.id).revision,2)
  assert.equal(detail.jobs.find((j:any)=>j.id===paid.id).snapshot.rules.interval,1,'Booked visit retains original terms')
  assert.equal(detail.readings[0].values.fields.reading,124)
  assert.equal((await serviceProductDetail(db,company,second.id)).agreements.find((a:any)=>a.kind==='MAINTENANCE').revision,1,'Unselected agreement retains original terms')
 }finally{await db.query('ROLLBACK');db.release();await pool.end()}
})

test('concurrent after-sales transactions hold one company lock until rollback',async t=>{
 if(!process.env.DATABASE_URL){t.skip('DATABASE_URL is not configured.');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2}),one=await pool.connect(),two=await pool.connect(),key='rollback-lock-test-'+randomUUID()
 try{
  await one.query('BEGIN');await two.query('BEGIN')
  await serviceLock(one,key)
  await two.query("SET LOCAL lock_timeout='100ms'")
  await assert.rejects(serviceLock(two,key),(error:any)=>error.code==='55P03')
  await two.query('ROLLBACK');await one.query('ROLLBACK')
  await two.query('BEGIN');await serviceLock(two,key)
 }finally{await one.query('ROLLBACK');await two.query('ROLLBACK');one.release();two.release();await pool.end()}
})
