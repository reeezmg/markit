import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick } from 'vue'
import { invoiceBalance, invoiceDetails, invoiceDocumentLines, billDocumentLines } from '../utils/invoice-flow'
import { documentNotes } from '../utils/document-notes'
import { validateInvoiceSource, writeInvoiceDetails } from '../server/utils/invoice-flow'
import { invoiceListQuery } from '../server/utils/invoice-lists'
import { createBillSource } from '../server/utils/create-bill-source'
import { harness, billing, pageState, plain, composable } from './billing/harness'
import { renderPrintTemplate } from '../utils/print-template-renderer.client'
import { noTaxReceiptTemplate, fieldValue } from '../utils/print-templates'

const details = { dueDate:'2026-11-10',invoicePaymentTerms:'Net 14',subject:'PO-10' }
const payload = () => ({...details,billingMode:'invoice',paymentMethod:'Credit',paymentStatus:'PAID',grandTotal:1000,createdAt:'2026-10-28T06:00:00Z',
  client:{connect:{id:'customer'}},company:{connect:{id:'company'}},entries:{create:[]},type:'BILL'})

test('invoice inputs validate dates, terms and references; partial/full/reversed balances derive from receipts',()=>{
  assert.deepEqual(invoiceDetails(details,'2026-10-28T06:00:00Z'),details)
  for(const patch of [{dueDate:''},{dueDate:'2026-02-30'},{dueDate:'2026-10-27'},{invoicePaymentTerms:{}},{subject:'a'.repeat(501)}])assert.throws(()=>invoiceDetails({...details,...patch},'2026-10-28T06:00:00Z'))
  const bill:any={grandTotal:1000,paymentMethod:'Credit',paymentStatus:'PENDING',payments:[]}
  assert.deepEqual(invoiceBalance(bill),{amountReceived:0,balanceDue:1000,invoicePaymentStatus:'Unpaid'})
  bill.payments=[{status:'POS_CREDIT_RECEIPT',amount:400}]
  assert.deepEqual(invoiceBalance(bill),{amountReceived:400,balanceDue:600,invoicePaymentStatus:'Partially paid'})
  bill.payments.push({status:'POS_CREDIT_RECEIPT',amount:600})
  assert.deepEqual(invoiceBalance(bill),{amountReceived:1000,balanceDue:0,invoicePaymentStatus:'Paid'})
  bill.payments[1].status='POS_CREDIT_REVERSED'
  assert.equal(invoiceBalance(bill).balanceDue,600)
  const lines=invoiceDocumentLines({...bill,...details,billingMode:'invoice',invoiceCode:'INV-1',...invoiceBalance(bill),upiId:'store@bank'})
  assert.ok(lines.includes('Balance due: 600.00'));assert.ok(lines.includes('Subject: PO-10'));assert.ok(lines.includes('Payment terms: Net 14'))
  assert.deepEqual(invoiceDocumentLines({grandTotal:1000}),[])
})

test('customer notes and terms render for ordinary bills and invoices and reject invalid input', () => {
  const notes = documentNotes({ notes: 'Customer note\nSecond line', termsAndConditions: 'Receipt terms' })
  assert.deepEqual(billDocumentLines(notes), ['Customer notes: Customer note\nSecond line', 'Terms and conditions: Receipt terms'])
  assert.ok(billDocumentLines({ ...notes, billingMode: 'invoice' }).includes('Customer notes: Customer note\nSecond line'))
  for (const invalid of [{ notes: {} }, { termsAndConditions: false }, { notes: 'x'.repeat(5001) }, { termsAndConditions: 'x'.repeat(10001) }]) assert.throws(() => documentNotes(invalid))
})

function sourceDb(customer=true,enabled=true) {
  const calls:any[]=[]
  return {calls,async query(sql:string,values:any[]=[]):Promise<any>{
    calls.push({sql,values})
    if(sql.includes('FROM clients c JOIN company_clients'))return {rows:customer?[{id:'customer'}]:[],rowCount:customer?1:0}
    if(sql.includes('FROM accountant_v2_erp_settings'))return {rows:enabled?[{company_id:'company'}]:[],rowCount:enabled?1:0}
    if(sql.includes('SELECT 1 FROM clients'))return {rows:[{}],rowCount:1}
    if(sql.includes('RETURNING invoice_number'))return {rows:[{invoice_number:12,created_at:'2026-10-28T06:00:00Z'}],rowCount:1}
    return {rows:[],rowCount:0}
  }}
}
test('issuing an invoice validates its customer/accounting setup and forces unpaid credit without creating payments',async()=>{
  const db=sourceDb()
  const result=await createBillSource(db,{uuid:'bill',companyId:'company',payload:{...payload(),adjustment:-2,grandTotal:98},billPoints:0})
  assert.equal(result.invoiceNumber,12)
  const saved=JSON.parse(db.calls.find(c=>c.sql.includes('INSERT INTO bills')).values[0])
  assert.equal(saved.paymentStatus,'PENDING');assert.equal(saved.paymentMethod,'Credit');assert.equal(saved.type,'BILL')
  assert.equal(saved.adjustment,-2)
  assert.match(db.calls.find(c=>c.sql.includes('INSERT INTO bills')).sql,/terms_and_conditions, adjustment/)
  const invalid=sourceDb()
  await assert.rejects(createBillSource(invalid,{uuid:'bill',companyId:'company',payload:{...payload(),adjustment:'bad'}}),{statusCode:400})
  assert.equal(invalid.calls.length,0)
  const metadata=db.calls.find(c=>c.sql.startsWith('UPDATE bills SET invoice_code'))
  assert.deepEqual(metadata.values,['bill','company',details.dueDate,details.invoicePaymentTerms,details.subject])
  assert.ok(!db.calls.some(c=>c.sql.includes('INSERT INTO payments')))
  for(const [customer,enabled,statusCode] of [[false,true,400],[true,false,409]] as const){
    const db=sourceDb(customer,enabled)
    await assert.rejects(createBillSource(db,{uuid:'bill',companyId:'company',payload:payload()}),{statusCode})
    assert.ok(!db.calls.some(c=>c.sql.includes('INSERT INTO bills')))
  }
  for(const patch of [{paymentMethod:'Cash'},{creditUserId:'staff'},{grandTotal:0},{client:null},{splitPayments:[{method:'Cash',amount:1}]}]){
    await assert.rejects(validateInvoiceSource(sourceDb(),'company',{...payload(),...patch}),{statusCode:400})
  }
})

test('billing mode switches keep tender controls separate and drafts persist invoice fields per company',async t=>{
  const d=composable('composables/useBillingDraft.ts','useBillingDraft');t.after(d.stop);await d.mount()
  d.result.date.value='2026-10-28T06:00:00Z';await nextTick()
  const h=harness(billing,['changeBillingMode'],pageState({...d.result}));t.after(h.stop)
  h.context.changeBillingMode('invoice')
  assert.equal(h.context.paymentMethod.value,'Credit');assert.equal(h.context.selected.value,null)
  assert.equal(h.context.dueDate.value,'2026-10-28');assert.equal(h.context.invoicePaymentTerms.value,'Due on Receipt')
  h.context.changeBillingMode('paynow');assert.equal(h.context.paymentMethod.value,'Cash')
  Object.assign(d.result.billingMode,{value:'invoice'});d.result.dueDate.value=details.dueDate;d.result.invoicePaymentTerms.value=details.invoicePaymentTerms;d.result.invoiceReference.value=details.subject
  await nextTick();const snapshot=plain(d.result.currentBill.value)
  d.result.createNewBill();await nextTick();d.result.loadBill(snapshot.billNo)
  assert.equal(d.result.billingMode.value,'invoice');assert.equal(d.result.invoiceReference.value,'PO-10');assert.equal(d.result.dueDate.value,details.dueDate)
})

test('invoice creation keeps the saved invoice available when sending fails, without another source save',async t=>{
  const requests:any[]=[],actions:string[]=[],toasts:any[]=[]
  const h=harness(billing,['validateBillEntries','validateBillState','buildEntriesData','computeBillPoints','parseCreditParty','buildBillPayload','buildPrintData','ensureClientExists','handleSave'],pageState({
    billingMode:ref('invoice'),dueDate:ref(details.dueDate),invoicePaymentTerms:ref(details.invoicePaymentTerms),invoiceReference:ref(details.subject),
    selectedAction:ref('send'),clientId:ref('customer'),phoneNo:ref('9876543210'),date:ref('2026-10-28T06:00:00Z'),
    toast:{add:(v:any)=>toasts.push(v)},send:async()=>{actions.push('send');h.context.printModel.value=true},reset:()=>actions.push('reset'),
    $fetch:async(url:string,options:any)=>{requests.push({url,...options});return url.endsWith('findUniqueClient')?{id:'customer'}:{billId:'saved',invoiceNumber:12}},
  }));t.after(h.stop)
  await h.context.handleSave()
  const saved=requests.find(r=>r.url.endsWith('/create'))
  assert.equal(saved.body.payload.paymentMethod,'Credit');assert.equal(saved.body.payload.paymentStatus,'PENDING')
  assert.equal(saved.body.payload.subject,'PO-10');assert.equal(h.context.printData.billId,'saved')
  assert.equal(h.context.printData.balanceDue,100);assert.equal(h.context.printModel.value,true)
  assert.deepEqual(actions,['send','reset']);assert.equal(toasts.at(-1).title,'Invoice created — unpaid')
  assert.equal(requests.filter(r=>r.url.endsWith('/create')).length,1)
})

test('list builders keep company scope, active receipts, overdue dates and reversals explicit',()=>{
  for(const payments of [false,true]){
    const query=invoiceListQuery(['company'],{q:'test',state:payments?'':'overdue',from:'2026-10-01',to:'2026-10-28'},payments)
    assert.deepEqual(query.values[0],['company']);assert.match(query.sql,/b\.company_id=ANY\(\$1::text\[\]\)/)
    assert.match(query.sql,/b\.credit_user_id IS NULL/);assert.doesNotMatch(query.sql,/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/)
    if(payments)assert.match(query.sql,/POS_CREDIT_REVERSED/)
    else {assert.match(query.sql,/invoice-send/);assert.match(query.sql,/POS_CREDIT_RECEIPT/);assert.match(query.sql,/Asia\/Kolkata/)}
  }
  assert.throws(()=>invoiceListQuery(['company'],{page:0}));assert.throws(()=>invoiceListQuery(['company'],{state:'unknown'}))
  assert.throws(()=>invoiceListQuery(['company'],{from:'2026-02-30'},true))
})

test('invoice workspace opens the selected company invoice and resends its saved document without creating another bill',async t=>{
  const calls:any[]=[],toasts:any[]=[];let success=false
  const h=harness('components/Billing/InvoiceWorkspace.vue',['collect','send'],{
    busy:ref(''),receiptBill:ref(null),receiptMode:ref('collect'),receiptOpen:ref(false),picker:ref(true),
    scope:{fetch:async(url:string,options:any)=>{calls.push({url,...options});return {success}}},
    documentData:async()=>({clientPhone:'9876543210',clientName:'Alice',companyName:'Store',grandTotal:1000,date:'2026-10-28',companyId:'branch'}),
    refresh:async()=>{},toast:{add:(value:any)=>toasts.push(value)},
  });t.after(h.stop)
  const invoice={id:'bill',companyId:'branch',invoiceCode:'INV-1'}
  h.context.collect(invoice)
  assert.equal(h.context.receiptBill.value.id,'bill');assert.equal(h.context.receiptBill.value.companyId,'branch');assert.equal(h.context.receiptOpen.value,true)
  await h.context.send(invoice);assert.equal(toasts.at(-1).color,'red')
  success=true;await h.context.send(invoice);assert.equal(toasts.at(-1).color,'green')
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.url==='/api/whatsapp/send-payment-template'))
  assert.equal(calls[1].headers['x-company-id'],'branch');assert.equal(h.context.busy.value,'')
})

test('all receipt designs append invoice balances/terms and UPI asks only for the outstanding amount',async()=>{
  const texts:string[]=[]
  const context:any={fillRect(){},putImageData(){},measureText:(text:string)=>({width:text.length*5}),fillText:(text:string)=>texts.push(text),save(){},restore(){},translate(){},scale(){},drawImage(){},getImageData:(x:number,y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4).fill(255)})}
  const original=(globalThis as any).document
  ;(globalThis as any).document={createElement:()=>({width:0,height:0,getContext:()=>context})}
  try{
    const template=noTaxReceiptTemplate();template.elements=template.elements.filter(element=>element.type==='field'&&element.field==='grandTotal')
    const invoice={billingMode:'invoice',invoiceCode:'INV-1',grandTotal:1000,balanceDue:600,amountReceived:400,invoicePaymentStatus:'Partially paid',...details,upiId:'store@bank',notes:'Call before delivery',termsAndConditions:'Keep the receipt'}
    await renderPrintTemplate(template,invoice)
    assert.ok(texts.includes('Balance due: 600.00'));assert.ok(texts.includes('Payment terms: Net 14'))
    assert.ok(texts.includes('Customer notes: Call before delivery'));assert.ok(texts.includes('Terms and conditions: Keep the receipt'))
    assert.equal(new URL(fieldValue(invoice,'receiptUpiPayment')).searchParams.get('am'),'600.00')
    assert.equal(fieldValue({...invoice,balanceDue:0},'receiptUpiPayment'),'')
  }finally{(globalThis as any).document=original}
})

test('read-only database validates invoice lists and metadata statements without executing writes',{skip:process.env.INVOICE_READONLY_DATABASE!=='1'},async()=>{
  const dotenv=await import('dotenv');dotenv.config({quiet:true} as any)
  const {Client}=await import('pg');const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000})
  try{
    await db.connect();await db.query('BEGIN READ ONLY')
    for(const payments of [false,true])for(const state of ['','unpaid','partial','paid','overdue']){
      const query=invoiceListQuery(['company'],{state,from:'2026-10-01',to:'2026-10-28'},payments)
      await db.query('EXPLAIN '+query.sql,query.values)
      assert.deepEqual((await db.query(query.sql,query.values)).rows[0].rows,[])
    }
    const captured=sourceDb();await validateInvoiceSource(captured,'company',payload());await writeInvoiceDetails(captured,'company','bill',details)
    for(const call of captured.calls)await db.query('EXPLAIN '+call.sql,call.values)
    await db.query('ROLLBACK')
  }finally{await db.end()}
})
