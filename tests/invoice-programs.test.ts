import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { addInvoiceDays, invoiceCents, invoiceToday, nextRecurringDate, recurringInput, retainerBalances, retainerInput } from '../utils/invoice-programs'
import { recurringAction, saveRecurringInvoice, readRecurringInvoice, processRecurringInvoices } from '../server/utils/recurring-invoices'
import { retainerAction, saveRetainer, readRetainer } from '../server/utils/retainer-invoices'
import { receiptBill, reverseBillReceipt, assertNoBillReceipts } from '../server/utils/bill-receipts'
import { invoiceListQuery } from '../server/utils/invoice-lists'
import { programRequest } from '../utils/invoice-program-request.client'

const context = { companyId: 'company', userId: 'user' }, today = invoiceToday()
const template = () => ({ clientId:'customer',quoteDate:today,expiryDate:'',referenceNumber:'',subject:'Maintenance',salesperson:'',status:'DRAFT',
  notes:'Thank you',termsAndConditions:'Pay on time',paymentTerms:'Net 15',deliveryEstimate:'',discount:0,discountType:'amount',adjustment:0,
  items:[{id:'line',variantId:'',name:'Service',description:'',barcode:'',size:'',unit:'',quantity:1,rate:1000,discount:0,tax:18}] })
const profile = (requestId = 'profile') => ({requestId,name:'Monthly service',startDate:today,endDate:'',frequency:'MONTH',interval:1,generationMode:'DRAFT',dueDays:15,template:template()})
const retainer = (requestId = 'retainer') => ({requestId,clientId:'customer',retainerDate:today,description:'Project advance',reference:'PO-1',amount:1000,liabilityAccountId:'advance',notes:'Notes',termsAndConditions:'Terms'})

/** Runs the real services. This adapter has no database driver or network access. */
function fixture() {
  let state: any = { profiles:[],occurrences:[],retainers:[],events:[],payments:[],journals:[],lines:[],audits:new Map(),locked:false,
    currency:'INR',customer:true,source:true,postedAmount:1000,failPosting:false,failCommit:false,sourceBills:[],
    bill:{id:'invoice',company_id:'company',client_id:'customer',created_at:today+'T00:00:00Z',grand_total:1000,payment_method:'Credit',payment_status:'PENDING',type:'BILL',invoice_number:1},
    accounts:{advance:'OTHER_CURRENT_LIABILITY',bank:'BANK',cash:'CASH',ar:'ACCOUNTS_RECEIVABLE'} }
  let backup: any
  const calls: any[]=[]
  const profileRow = (p:any) => ({...p,clientName:'Customer',clientPhone:'123',startDate:p.start_date,endDate:p.end_date,nextDate:p.next_date,generationMode:p.generation_mode,dueDays:p.due_days})
  const retainerRow = (r:any) => ({...r,clientId:r.client_id,clientName:'Customer',retainerDate:r.retainer_date,liabilityAccountId:r.liability_account_id,termsAndConditions:r.terms_and_conditions})
  const result = (rows:any[]=[]) => ({rows,rowCount:rows.length})
  const db = { release(){}, async query(raw:string,args:any[]=[]):Promise<any> {
    const sql=raw.trim();calls.push({sql,args})
    if(sql==='BEGIN'){backup=structuredClone(state);return result()}
    if(sql==='ROLLBACK'){if(backup)state=backup;backup=null;return result()}
    if(sql==='COMMIT'){if(state.failCommit)throw Error('deferred posting failed');backup=null;return result()}
    if(sql.startsWith('SET LOCAL') || sql.includes('set_config(') || sql.includes('pg_advisory_xact_lock'))return result()
    if(sql.startsWith('SELECT "after"'))return result(state.audits.has(args[0])?[{after:state.audits.get(args[0])}]:[])
    if(sql.startsWith('INSERT INTO accountant_v2_accountant_audit')){state.audits.set(args[0],JSON.parse(args[5]));return result()}
    if(sql.startsWith('SELECT id,currency,name FROM companies'))return result(args[0]==='company'?[{id:'company',currency:state.currency}]:[])
    if(sql.includes('FROM clients c JOIN company_clients'))return result(args[0]==='customer' && args[1]==='company' && state.customer?[{id:'customer',name:'Customer'}]:[])
    if(sql.startsWith('SELECT id,account_type FROM accountant_v2_accounting_accounts'))return result(args[1]==='company' && args[3]===state.currency && args[2].includes(state.accounts[args[0]])?[{id:args[0],account_type:state.accounts[args[0]]}]:[])
    if(sql.startsWith('SELECT COALESCE(max(number)'))return result([{number:state.retainers.length+1}])
    if(sql.startsWith('INSERT INTO retainer_invoices')){
      const [id,company_id,client_id,number,currency,retainer_date,description,reference,notes,terms_and_conditions,amount,liability_account_id,revision,created_by]=args
      const existing=state.retainers.find((r:any)=>r.id===id)
      const row={id,company_id,client_id,number,currency,retainer_date,description,reference,notes,terms_and_conditions,amount,liability_account_id,revision,created_by,status:existing?.status||'DRAFT'}
      if(existing)Object.assign(existing,row);else state.retainers.push(row);return result()
    }
    if(sql.includes('FROM retainer_invoices r') && sql.includes('r.id=$1'))return result(state.retainers.filter((r:any)=>r.id===args[0] && r.company_id===args[1]).map(retainerRow))
    if(sql.startsWith('SELECT e.*,to_char(e.event_date'))return result(state.events.filter((e:any)=>e.retainer_id===args[0] && e.company_id===args[1]).map((e:any)=>({...e,eventDate:e.event_date,reversalId:state.events.find((r:any)=>r.reverses_id===e.id)?.id})))
    if(sql.startsWith('UPDATE retainer_invoices')){const row=state.retainers.find((r:any)=>r.id===args[0] && r.company_id===args[1]);if(row){row.status=sql.includes("status='SENT'")?'SENT':args[2];row.revision=args.at(-1)}return result()}
    if(sql.startsWith('INSERT INTO retainer_events')){
      const [id,company_id,retainer_id,kind,amount,event_date,reference,payment_method,account_id,bill_id,payment_id,journal_id,reverses_id,created_by]=args
      state.events.push({id,company_id,retainer_id,kind,amount,event_date,reference,payment_method,account_id,bill_id,payment_id,journal_id,reverses_id,created_by});return result()
    }
    if(sql.startsWith('SELECT reason FROM accountant_v2_transaction_locks'))return result(state.locked?[{reason:'Closed'}]:[])
    if(sql.startsWith('SELECT * FROM bills'))return result(args[0]==='invoice' && args[1]==='company'?[{...state.bill}]:[])
    if(sql.startsWith('SELECT p.*, j.id'))return result(state.payments.filter((p:any)=>p.company_id===args[0] && p.bill_id===args[1]).map((p:any)=>({...p,journal_id:state.journals.find((j:any)=>j.source_type==='ERP_CREDIT_RECEIPT' && j.source_id===p.id)?.id})))
    if(sql.startsWith('SELECT id FROM payments'))return result(state.payments.filter((p:any)=>p.company_id===args[0] && p.bill_id===args[1] && args[2].includes(p.status) && !p.deleted).slice(0,1))
    if(sql.startsWith('SELECT s.*,j.currency'))return result(state.source?[{journal_id:'source',accounts:{receivable:'ar'},journal_status:'PUBLISHED',currency:'INR',signature:{}}]:[])
    if(sql.startsWith('SELECT sum(l.amount)'))return result([{amount:state.postedAmount,source_parties:{creditAccount:{id:'customer',name:'Customer'}}}])
    if(sql.startsWith('INSERT INTO payments')){const [id,company_id,bill_id,client_id,payment_date,payment_reference,amount,currency,status]=args;state.payments.push({id,company_id,bill_id,client_id,payment_date,payment_reference,amount,currency,status,payment_mode:'Retainer',deleted:false});return result()}
    if(sql.startsWith('UPDATE payments')){state.payments.find((p:any)=>p.id===args[0] && p.company_id===args[1]).status=args[2];return result()}
    if(sql.startsWith('UPDATE bills SET payment_status')){state.bill.payment_status=args[2];return result()}
    if(sql.startsWith('INSERT INTO accountant_v2_manual_journals')){
      const [id,company_id,entry_number,journal_date,reference_number,notes,currency,total,source_type,source_id,reversed_from_id]=args
      state.journals.push({id,company_id,entry_number,journal_date,reference_number,notes,currency,total,source_type,source_id,reversed_from_id,status:'PUBLISHED'});return result()
    }
    if(sql.startsWith('INSERT INTO accountant_v2_manual_journal_lines')){
      if(state.failPosting)throw Error('Journal failed')
      const [id,company_id,journal_id,account_id,side,amount,description,parties]=args;state.lines.push({id,company_id,journal_id,account_id,side,amount,description,source_parties:JSON.parse(parties)});return result()
    }
    if(sql.startsWith('SELECT id,status,deleted_at FROM accountant_v2_manual_journals'))return result(state.journals.filter((j:any)=>j.id===args[0] && j.company_id===args[1]))
    if(sql.startsWith('SELECT account_id,side,amount,source_parties'))return result(state.lines.filter((l:any)=>l.journal_id===args[0] && l.company_id===args[1]))
    if(sql.startsWith('INSERT INTO recurring_invoices')){
      const [id,company_id,client_id,name,currency,frequency,interval,start_date,end_date,next_date,status,generation_mode,due_days,rawTemplate,revision,created_by]=args
      const old=state.profiles.find((p:any)=>p.id===id), row={id,company_id,client_id,name,currency,frequency,interval,start_date,end_date,next_date,status,generation_mode,due_days,template:JSON.parse(rawTemplate),revision,created_by}
      if(old)Object.assign(old,row);else state.profiles.push(row);return result()
    }
    if(sql.includes('FROM recurring_invoices r JOIN clients') && sql.includes('WHERE r.id=$1'))return result(state.profiles.filter((p:any)=>p.id===args[0] && p.company_id===args[1]).map(profileRow))
    if(sql.startsWith('SELECT o.id,to_char(o.invoice_date'))return result(state.occurrences.filter((o:any)=>o.profile_id===args[0] && o.company_id===args[1]))
    if(sql.startsWith('INSERT INTO recurring_invoice_occurrences')){
      const [id,company_id,profile_id,invoice_date,due_date,rawTemplate]=args
      if(state.occurrences.some((o:any)=>o.profile_id===profile_id && o.invoice_date===invoice_date))return result()
      state.occurrences.push({id,company_id,profile_id,invoice_date,due_date,template:JSON.parse(rawTemplate)});return result([{id}])
    }
    if(sql.startsWith('SELECT *,to_char(invoice_date'))return result(state.occurrences.filter((o:any)=>o.id===args[0] && o.company_id===args[1] && o.profile_id===args[2]).map((o:any)=>({...o,day:o.invoice_date,due:o.due_date})))
    if(sql.startsWith('UPDATE recurring_invoice_occurrences')){state.occurrences.find((o:any)=>o.id===args[1] && o.company_id===args[2]).bill_id=args[0];return result()}
    if(sql.startsWith('UPDATE recurring_invoices SET next_date')){const p=state.profiles.find((p:any)=>p.id===args[0]);p.next_date=args[2];p.status=args[3];p.revision=args[4];return result()}
    if(sql.startsWith("UPDATE recurring_invoices SET status='PAUSED'")){const p=state.profiles.find((p:any)=>p.id===args[0]);p.status='PAUSED';p.revision=args[2];return result()}
    if(sql.startsWith('UPDATE recurring_invoices SET status=$3')){const p=state.profiles.find((p:any)=>p.id===args[0]);p.status=args[2];p.next_date=args[3];p.revision=args[4];return result()}
    if(sql.startsWith('SELECT r.id,r.company_id FROM recurring_invoices'))return result(state.profiles.filter((p:any)=>p.status==='ACTIVE' && p.next_date<=args[0] && !args[1].includes(p.id)).slice(0,1))
    if(sql.startsWith('SELECT count(*) FROM recurring_invoices'))return result([{count:state.profiles.filter((p:any)=>p.status==='ACTIVE' && p.next_date<=args[0]).length}])
    if(sql.startsWith('UPDATE recurring_invoices SET last_error')){state.profiles.find((p:any)=>p.id===args[0]).last_error=args[2];return result()}
    if(sql.startsWith('SELECT user_id FROM company_users'))return result([{user_id:'user'}])
    if(sql.includes('FROM accountant_v2_erp_settings'))return result(state.source?[{company_id:'company'}]:[])
    if(sql.startsWith('SELECT 1 FROM clients WHERE'))return result([{id:'customer'}])
    if(sql.startsWith("SELECT to_regclass('public.service_configurations')"))return result([{ready:false}])
    if(sql.startsWith('WITH p AS (SELECT $1::jsonb')){state.sourceBills.push({id:args[1],payload:JSON.parse(args[0])});return result([{invoice_number:state.sourceBills.length,created_at:today+'T00:00:00Z'}])}
    if(sql.startsWith('UPDATE bills SET invoice_code') || sql.startsWith('INSERT INTO entries') || sql.startsWith('DELETE FROM coupon_clients') || sql.includes('FROM coupons') || sql.startsWith('SELECT item_id, qty, return FROM entries'))return result()
    throw Error('Unmocked query: '+sql)
  }}
  return {db,calls,pool:{query:db.query,connect:async()=>db},get state(){return state},async transaction(fn:()=>Promise<any>){const original=structuredClone(state);try{return await fn()}catch(error){state=original;throw error}}}
}

test('calendar anchors survive short months, leap years, intervals and time zones',()=>{
  assert.equal(nextRecurringDate('2025-01-31','MONTH',1,'2025-01-31'),'2025-02-28')
  assert.equal(nextRecurringDate('2025-01-31','MONTH',1,'2025-02-28'),'2025-03-31')
  assert.equal(nextRecurringDate('2024-02-29','YEAR',1,'2027-02-28'),'2028-02-29')
  assert.equal(nextRecurringDate('2026-01-31','MONTH',3,'2026-04-30'),'2026-07-31')
  assert.equal(nextRecurringDate('2026-10-01','WEEK',2,'2026-10-30',true),'2026-11-12')
  assert.equal(nextRecurringDate('2026-10-01','DAY',3,'2026-10-10',true),'2026-10-10')
  assert.equal(addInvoiceDays('2026-12-31',1),'2027-01-01')
})
test('input validation rejects malformed dates, money, schedules, terms and negative totals',()=>{
  for(const amount of [0,-1,1.001,NaN,Infinity,'2',null])assert.throws(()=>invoiceCents(amount))
  for(const patch of [{startDate:'2026-02-30'},{endDate:'2000-01-01'},{frequency:'MINUTE'},{interval:0},{interval:1.5},{dueDays:-1},{generationMode:'EMAIL'},{name:''}])assert.throws(()=>recurringInput({...profile(),...patch}))
  assert.throws(()=>recurringInput({...profile(),template:{...template(),items:[]}}))
  assert.throws(()=>retainerInput({...retainer(),amount:-2}))
  assert.throws(()=>retainerInput({...retainer(),clientId:''}))
  assert.throws(()=>retainerInput({...retainer(),notes:'x'.repeat(5001)}))
})
test('request IDs survive retry when browser storage is unavailable and change after success',()=>{
  const first=programRequest('test-action',{amount:10}), retry=programRequest('test-action',{amount:10})
  assert.equal(first.requestId,retry.requestId)
  assert.notEqual(programRequest('other-company',{amount:10}).requestId,first.requestId)
  assert.notEqual(programRequest('test-action',{amount:11}).requestId,first.requestId)
  retry.clear()
  assert.notEqual(programRequest('test-action',{amount:10}).requestId,first.requestId)
})
test('recurring retries create one frozen draft; issuing uses the ordinary bill writer once',async()=>{
  const f=fixture(), p=await saveRecurringInvoice(f.db,context,profile())
  assert.deepEqual(await saveRecurringInvoice(f.db,context,profile()),p)
  const body={action:'generate',requestId:'generate'}
  await recurringAction(f.db,context,p.id,body);await recurringAction(f.db,context,p.id,body)
  assert.equal(f.state.occurrences.length,1);assert.equal(f.state.sourceBills.length,0)
  assert.equal(f.state.occurrences[0].due_date,addInvoiceDays(today,15))
  const snapshot=structuredClone(f.state.occurrences[0].template)
  const row=await readRecurringInvoice(f.db,'company',p.id)
  await saveRecurringInvoice(f.db,context,{...profile('edit'),revision:row.revision,template:{...template(),clientId:'customer',notes:'Changed'}},p.id)
  assert.deepEqual(f.state.occurrences[0].template,snapshot)
  const issue={action:'issue',occurrenceId:f.state.occurrences[0].id,requestId:'issue'}
  await recurringAction(f.db,context,p.id,issue);await recurringAction(f.db,context,p.id,{...issue,requestId:'issue-again'})
  assert.equal(f.state.sourceBills.length,1)
  const payload=f.state.sourceBills[0].payload
  assert.equal(payload.billingMode,'invoice');assert.equal(payload.paymentMethod,'Credit');assert.equal(payload.paymentStatus,'PENDING')
  assert.equal(payload.notes,'Thank you');assert.equal(payload.dueDate,addInvoiceDays(today,15));assert.equal(payload.grandTotal,1000)
})
test('pause, resume, inclusive end date and optimistic edits protect recurring profiles',async()=>{
  const f=fixture(), p=await saveRecurringInvoice(f.db,context,{...profile(),endDate:today})
  await recurringAction(f.db,context,p.id,{action:'pause',requestId:'pause'})
  await assert.rejects(recurringAction(f.db,context,p.id,{action:'generate',requestId:'g'}),/no due/)
  await recurringAction(f.db,context,p.id,{action:'resume',requestId:'resume'})
  await assert.rejects(saveRecurringInvoice(f.db,context,{...profile('edit'),revision:p.revision},p.id),/changed/)
  await recurringAction(f.db,context,p.id,{action:'generate',requestId:'generate'})
  assert.equal(f.state.occurrences.length,1);assert.equal(f.state.profiles[0].status,'COMPLETED')
  await assert.rejects(recurringAction(f.db,{...context,companyId:'foreign'},p.id,{action:'issue',requestId:'foreign'}),/not found/)
})
test('cron commits one due occurrence and does not duplicate on another invocation',async()=>{
  const f=fixture();await saveRecurringInvoice(f.db,context,profile())
  assert.deepEqual(await processRecurringInvoices(f.pool),{created:1,failed:0,remaining:0})
  assert.deepEqual(await processRecurringInvoices(f.pool),{created:0,failed:0,remaining:0})
  assert.equal(f.state.occurrences.length,1)
})
test('cron rolls back source, occurrence and date if deferred posting fails; next run can retry',async()=>{
  const f=fixture();await saveRecurringInvoice(f.db,context,{...profile(),generationMode:'ISSUE'})
  f.state.failCommit=true
  const log=console.error;console.error=()=>{}
  try {assert.deepEqual(await processRecurringInvoices(f.pool),{created:0,failed:1,remaining:1})}finally{console.error=log}
  assert.equal(f.state.occurrences.length,0);assert.equal(f.state.sourceBills.length,0);assert.equal(f.state.profiles[0].next_date,today)
  assert.match(f.state.profiles[0].last_error,/Generation failed/)
  f.state.failCommit=false
  assert.equal((await processRecurringInvoices(f.pool)).created,1);assert.equal(f.state.sourceBills.length,1)
})
test('retainer requests post nothing; collections, applications, removals and refunds balance independently',async()=>{
  const f=fixture(), r=await saveRetainer(f.db,context,retainer())
  assert.deepEqual(await saveRetainer(f.db,context,retainer()),r)
  assert.equal(f.state.journals.length,0);assert.equal(f.state.payments.length,0);assert.equal(f.state.sourceBills.length,0)
  const collect={action:'collect',amount:1000,date:today,paymentMethod:'Bank',accountId:'bank',requestId:'collect'}
  await retainerAction(f.db,context,r.id,collect);await retainerAction(f.db,context,r.id,collect)
  assert.equal(f.state.events.length,1);assert.deepEqual(retainerBalances(f.state.events),{collected:1000,applied:0,refunded:0,available:1000})
  const apply={action:'apply',billId:'invoice',amount:400,date:today,requestId:'apply'}
  await retainerAction(f.db,context,r.id,apply);await retainerAction(f.db,context,r.id,apply)
  assert.equal((await receiptBill(f.db,'company','invoice')).outstanding,600)
  await assert.rejects(assertNoBillReceipts(f.db,'company','invoice'),/Reverse/)
  const applied=f.state.events.find((e:any)=>e.kind==='APPLY')
  await assert.rejects(reverseBillReceipt(f.db,'company','user',{billId:'invoice',receiptId:applied.payment_id,paymentDate:today,requestId:'wrong-reverse'}),/Retainer invoices/)
  await retainerAction(f.db,context,r.id,{action:'refund',amount:600,date:today,paymentMethod:'Bank',accountId:'bank',requestId:'refund'})
  assert.equal((await readRetainer(f.db,'company',r.id)).available,0)
  const remove={action:'unapply',eventId:applied.id,date:today,requestId:'remove'}
  await retainerAction(f.db,context,r.id,remove);await retainerAction(f.db,context,r.id,remove)
  assert.equal((await receiptBill(f.db,'company','invoice')).outstanding,1000)
  assert.equal((await readRetainer(f.db,'company',r.id)).available,400)
  await assert.rejects(retainerAction(f.db,context,r.id,{...remove,requestId:'remove-again'}),/already removed/)
  assert.deepEqual(f.state.lines.map((l:any)=>[l.account_id,l.side,l.amount]),[
    ['bank','DEBIT',1000],['advance','CREDIT',1000],['advance','DEBIT',400],['ar','CREDIT',400],
    ['advance','DEBIT',600],['bank','CREDIT',600],['ar','DEBIT',400],['advance','CREDIT',400],
  ])
  assert.equal(f.state.journals[3].reversed_from_id,f.state.journals[1].id)
  assert.ok(f.state.lines.slice(2,4).every((l:any)=>l.source_parties.creditAccount.id==='customer'))
})
test('multiple advances settle one invoice without double collection',async()=>{
  const f=fixture()
  for(let i=0;i<2;i++){
    const r=await saveRetainer(f.db,context,{...retainer('retainer-'+i),amount:500})
    await retainerAction(f.db,context,r.id,{action:'collect',amount:500,date:today,paymentMethod:'Cash',accountId:'cash',requestId:'c'+i})
    await retainerAction(f.db,context,r.id,{action:'apply',amount:500,billId:'invoice',date:today,requestId:'a'+i})
  }
  assert.equal((await receiptBill(f.db,'company','invoice')).outstanding,0);assert.equal(f.state.bill.payment_status,'PAID')
})
test('an invoice paid partly in cash can settle its remaining balance with a retainer',async()=>{
  const f=fixture(),r=await saveRetainer(f.db,context,retainer())
  f.state.payments.push({id:'cash-receipt',company_id:'company',bill_id:'invoice',payment_mode:'Cash',amount:400,status:'POS_CREDIT_RECEIPT',deleted:false})
  await retainerAction(f.db,context,r.id,{action:'collect',amount:1000,date:today,paymentMethod:'Cash',accountId:'cash',requestId:'collect'})
  await retainerAction(f.db,context,r.id,{action:'apply',amount:600,billId:'invoice',date:today,requestId:'apply'})
  assert.equal((await receiptBill(f.db,'company','invoice')).outstanding,0)
  assert.equal(f.state.bill.payment_status,'PAID');assert.equal((await readRetainer(f.db,'company',r.id)).available,400)
})
test('unused credit and invoice outstanding bounds reject overspending atomically',async()=>{
  const f=fixture(),r=await saveRetainer(f.db,context,retainer())
  await assert.rejects(retainerAction(f.db,context,r.id,{action:'apply',amount:1,billId:'invoice',date:today,requestId:'unpaid'}),/unused/)
  await assert.rejects(retainerAction(f.db,context,r.id,{action:'collect',amount:1001,date:today,paymentMethod:'Cash',accountId:'cash',requestId:'overcollect'}),/requested/)
  await retainerAction(f.db,context,r.id,{action:'collect',amount:500,date:today,paymentMethod:'Cash',accountId:'cash',requestId:'collect'})
  for(const action of ['apply','refund'])await assert.rejects(retainerAction(f.db,context,r.id,{action,amount:501,billId:'invoice',date:today,paymentMethod:'Cash',accountId:'cash',requestId:action}),/unused/)
  f.state.bill.grand_total=300;f.state.postedAmount=300
  await assert.rejects(retainerAction(f.db,context,r.id,{action:'apply',amount:400,billId:'invoice',date:today,requestId:'outstanding'}),/invoice balance/)
  assert.equal(f.state.events.length,1);assert.equal(f.state.payments.length,0)
})
test('company/customer/currency/account/period and posted-source checks reject unsafe advance actions',async()=>{
  for(const [mutate,action,patch,pattern] of [
    [(s:any)=>s.locked=true,'collect',{},/locked/],
    [()=>{},'collect',{accountId:'ar'},/required type/],
    [()=>{},'collect',{date:'2000-01-01'},/date on or after/],
    [()=>{},'collect',{date:'2100-01-01'},/up to today/],
    [(s:any)=>s.currency='USD','collect',{},/currency changed/],
    [(s:any)=>s.customer=false,'collect',{},/linked/],
    [(s:any)=>s.bill.client_id='other','apply',{},/same customer/],
    [(s:any)=>s.source=false,'apply',{},/Post this invoice/],
    [(s:any)=>s.postedAmount=900,'apply',{},/receivable needs/],
  ] as any[]){
    const f=fixture(),r=await saveRetainer(f.db,context,retainer())
    if(action==='apply')await retainerAction(f.db,context,r.id,{action:'collect',amount:1000,date:today,paymentMethod:'Cash',accountId:'cash',requestId:'collect'})
    mutate(f.state);const before=f.state.events.length
    await assert.rejects(f.transaction(()=>retainerAction(f.db,context,r.id,{action,amount:100,date:today,paymentMethod:'Cash',accountId:'cash',billId:'invoice',requestId:'unsafe',...patch})),pattern)
    assert.equal(f.state.events.length,before);assert.equal(f.state.payments.length,0)
  }
})
test('paid retainers are immutable; void requests cannot collect; journal failures roll back',async()=>{
  const f=fixture(),r=await saveRetainer(f.db,context,retainer())
  const collect={action:'collect',amount:100,date:today,paymentMethod:'Cash',accountId:'cash',requestId:'collect'}
  f.state.failPosting=true
  await assert.rejects(f.transaction(()=>retainerAction(f.db,context,r.id,collect)),/Journal failed/)
  assert.equal(f.state.events.length,0);assert.equal(f.state.journals.length,0)
  f.state.failPosting=false;await retainerAction(f.db,context,r.id,collect)
  await assert.rejects(saveRetainer(f.db,context,{...retainer('edit'),revision:r.revision},r.id),/cannot be edited/)
  await assert.rejects(retainerAction(f.db,context,r.id,{action:'void',requestId:'void'}),/financial history/)
  const next=await saveRetainer(f.db,context,retainer('new'))
  await retainerAction(f.db,context,next.id,{action:'void',requestId:'void-new'})
  await assert.rejects(retainerAction(f.db,context,next.id,collect),/voided/)
  await assert.rejects(readRetainer(f.db,'foreign',r.id),/not found/)
})
test('customer invoice filtering remains parameterized; source APIs own all program models',()=>{
  const query=invoiceListQuery(['company'],{clientId:"customer' OR true--",collectible:'1',state:'unpaid'})
  assert.ok(query.sql.includes('b.client_id=$3'));assert.equal(query.values[2],"customer' OR true--");assert.ok(!query.sql.includes("customer'"))
  const schema=readFileSync('schema.zmodel','utf8'),guard=readFileSync('server/utils/organizationModelScope.ts','utf8')
  for(const name of ['RecurringInvoice','RecurringInvoiceOccurrence','RetainerInvoice','RetainerEvent']){
    assert.ok(schema.includes('model '+name+' {'));assert.ok(guard.includes("'"+name+"'"))
  }
})
