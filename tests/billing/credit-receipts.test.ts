import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { harness } from './harness'
import { billOutstanding, billCreditCents } from '../../utils/bill-credit'
import { assertNoBillReceipts } from '../../server/utils/bill-receipts'
import { createError } from 'h3'
import ts from 'typescript'
import vm from 'node:vm'

// Execute the endpoint with an in-memory transaction adapter; no database access.
function methodCorrection(overrides: any = {}, receipts: string[] = []) {
  const bill = {id:'bill',company_id:'company',grand_total:100,payment_method:'Credit',payment_status:'PENDING',...overrides}
  const calls: any[] = []
  const client = {release(){},async query(sql:string,args:any[] = []) {
    calls.push({sql,args})
    if(sql.startsWith('SELECT * FROM bills')) return {rows:[bill]}
    if(sql.startsWith('SELECT id FROM payments')) return {rows:receipts.filter(status=>args[2].includes(status)).map(id=>({id}))}
    if(sql.includes('UPDATE bills')) return {rowCount:1,rows:[{invoice_number:791,payment_method:args[2]}]}
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return {rows:[]}
    throw Error('Unexpected SQL: '+sql)
  }}
  const file = 'server/api/billSale/updatePaymentMethod.post.ts'
  const source = ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
  const body = source.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(source)).join('\n').replace('export default ', 'globalThis.handler = ')
  const context:any = {pool:{connect:async()=>client},defineEventHandler:(fn:any)=>fn,readBody:async()=>({billId:'bill',companyId:'company',paymentMethod:'UPI'}),useCompanyRequestSession:async()=>({data:{companyId:'company'}}),createError,assertNoBillReceipts,billCreditCents}
  vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context)
  return {calls,run:()=>context.handler({})}
}

test('unpaid credit can be corrected to UPI and marked paid in one transaction',async()=>{
  const f=methodCorrection()
  const result=await f.run()
  assert.equal(result.paymentMethod,'UPI')
  const update=f.calls.find(c=>c.sql.includes('UPDATE bills'))
  assert.deepEqual(Array.from(update.args),['bill','company','UPI',null,'PAID'])
  assert.equal(f.calls.at(-1).sql,'COMMIT')
})

test('method corrections block active receipts and staff debt',async()=>{
  for(const f of [methodCorrection({},['POS_CREDIT_RECEIPT']),methodCorrection({credit_user_id:'staff'})]) {
    await assert.rejects(f.run(),(error:any)=>error.statusCode===409)
    assert.equal(f.calls.some(c=>c.sql.includes('UPDATE bills')),false)
    assert.equal(f.calls.at(-1).sql,'ROLLBACK')
  }
})

test('method correction succeeds after reversal or for paid credit without collections',async()=>{
  for(const f of [methodCorrection({},['POS_CREDIT_REVERSED']),methodCorrection({payment_status:'PAID'})]) {
    assert.equal((await f.run()).paymentMethod,'UPI')
    assert.equal(f.calls.at(-1).sql,'COMMIT')
    assert.equal(f.calls.filter(c=>/^\s*(UPDATE|DELETE|INSERT)\b/.test(c.sql)).length,1)
  }
})

test('sales method correction sends the bill company and displays server conflicts',async t=>{
  const sent:any[] = [], toasts:any[] = []
  const h=harness('pages/erp/sales.vue',['updateBillPaymentMethod'],{
    changePaymentMethodBill:ref({id:'bill',companyId:'branch',paymentMethod:'Credit'}),changePaymentMethodDraft:ref('UPI'),
    useAuth:()=>({session:ref({companyId:'head-office'})}),toast:{add:(value:any)=>toasts.push(value)},
    requireReceiptReversal:()=>false,
    $fetch:async(url:string,options:any)=>{sent.push({url,...options});throw {statusCode:409,data:{statusMessage:'This bill has receipt history.'}}},
  });t.after(h.stop)
  await h.context.updateBillPaymentMethod()
  assert.equal(sent[0].headers['x-company-id'],'branch')
  assert.equal(sent[0].body.companyId,'branch')
  assert.equal(sent[0].body.paymentMethod,'UPI')
  assert.equal(toasts[0].description,'This bill has receipt history.')
})

test('Delete and Change method open reversal first for full or partial collections',t=>{
  const toasts:any[] = []
  const h=harness('pages/erp/sales.vue',['openCreditCollection','showRequiredReversal','requireReceiptReversal','openDeleteBill','openChangePaymentMethod'],{
    receiptStatus:'POS_CREDIT_RECEIPT',creditReceiptBill:ref(null),creditReceiptMode:ref('collect'),creditReceiptOpen:ref(false),
    isDeleteModalOpen:ref(false),isChangePaymentMethodOpen:ref(false),isSplitModalOpen:ref(false),deletingRowIdentity:ref({}),
    changePaymentMethodBill:ref(null),changePaymentMethodDraft:ref(''),toast:{add:(value:any)=>toasts.push(value)},
    useAuth:()=>({session:ref({companyId:'company'})}),
  });t.after(h.stop)
  for(const status of ['PAID','PENDING']) for(const action of ['openDeleteBill','openChangePaymentMethod']) {
    h.context.creditReceiptOpen.value=false
    h.context[action]({id:'bill',companyId:'branch',paymentMethod:'Credit',paymentStatus:status,payments:[{status:'POS_CREDIT_RECEIPT',amount:50}]})
    assert.equal(h.context.creditReceiptOpen.value,true)
    assert.equal(h.context.creditReceiptMode.value,'reverse')
    assert.equal(h.context.creditReceiptBill.value.companyId,'branch')
    assert.equal(h.context.isDeleteModalOpen.value,false)
    assert.equal(h.context.isChangePaymentMethodOpen.value,false)
  }
  assert.equal(toasts.length,4)
  for(const payments of [[],[{status:'POS_CREDIT_REVERSED'}]]) {
    const uncollected={id:'bill',paymentMethod:'Credit',paymentStatus:'PAID',payments}
    h.context.openDeleteBill(uncollected)
    assert.equal(h.context.isDeleteModalOpen.value,true)
    h.context.openChangePaymentMethod(uncollected)
    assert.equal(h.context.isChangePaymentMethodOpen.value,true)
  }
})

test('concurrent collection conflict opens reversal from Delete without mutating again',async t=>{
  const calls:any[] = []
  const row={id:'bill',companyId:'branch',paymentMethod:'Credit',payments:[]}
  const h=harness('pages/erp/sales.vue',['deleteBill','requireReceiptReversal'],{
    receiptStatus:'POS_CREDIT_RECEIPT',deletingRowIdentity:ref(row),isDeleteModalOpen:ref(true),
    useAuth:()=>({session:ref({companyId:'head-office'})}),showRequiredReversal:(bill:any)=>calls.push(bill),
    $fetch:async(url:string,options:any)=>{assert.equal(options.body.companyId,'branch');throw {data:{data:{code:'BILL_RECEIPTS_REQUIRE_REVERSAL'}}}},
  });t.after(h.stop)
  await h.context.deleteBill()
  assert.equal(calls.length,1)
  assert.equal(calls[0].id,'bill')
  assert.equal(h.context.isDeleteModalOpen.value,false)
})

test('credit receipt component and owning pages compile',()=>{
  for(const file of ['components/Billing/CreditReceiptModal.vue','pages/erp/accounts.vue','pages/erp/sales.vue','pages/reports/daily.vue']) {
    const {descriptor,errors}=parse(readFileSync(file,'utf8'),{filename:file})
    assert.deepEqual(errors,[])
    compileScript(descriptor,{id:file})
    const template=compileTemplate({source:descriptor.template!.content,filename:file,id:file})
    assert.deepEqual(template.errors,[])
  }
})

test('customer pending totals subtract partial receipts and preserve split cash',t=>{
  const h=harness('pages/erp/accounts.vue',['getPendingAmount'],{billOutstanding});t.after(h.stop)
  const amount=h.context.getPendingAmount({bill:[
    {paymentStatus:'PENDING',paymentMethod:'Credit',grandTotal:1000,payments:[{status:'POS_CREDIT_RECEIPT',amount:400}]},
    {paymentStatus:'PENDING',paymentMethod:'Split',grandTotal:1000,splitPayments:[{method:'Cash',amount:400},{method:'Credit',amount:600}],payments:[{status:'POS_CREDIT_RECEIPT',amount:200}]},
    {paymentStatus:'PAID',paymentMethod:'Credit',grandTotal:1000,payments:[{status:'POS_CREDIT_RECEIPT',amount:1000}]},
  ]})
  assert.equal(amount,1000)
})

test('sales opens dated receipts for credit without calling status mutation',t=>{
  const h=harness('pages/erp/sales.vue',['openCreditCollection','handleEnterPayment'],{sales:ref([{id:'bill',paymentMethod:'Credit'}]),creditReceiptBill:ref(null),creditReceiptMode:ref('collect'),creditReceiptOpen:ref(false),isOpen:ref(false),activeBillInfo:ref(null),onPaymentStatusChange:()=>{throw Error('Unexpected status mutation')}});t.after(h.stop)
  h.context.handleEnterPayment('bill','PAID','1','owner')
  assert.equal(h.context.creditReceiptOpen.value,true)
  assert.equal(h.context.creditReceiptBill.value.companyId,'owner')
  assert.equal(h.context.isOpen.value,false)
})

test('receipt modal retains entered values and request ID after failure, then reloads the due',async t=>{
  const sent:any[]=[],emitted:any[]=[],key='bill-credit-receipt:owner:bill'
  const h=harness('components/Billing/CreditReceiptModal.vue',['key','accounts','save'],{
    props:{bill:{id:'bill',companyId:'owner'}},state:ref({outstanding:1000,accounts:[{id:'bank',type:'BANK',name:'Bank'}]}),method:ref('UPI'),accountId:ref('bank'),amount:ref(400),date:ref('2026-10-05'),reference:ref('ABC'),saving:ref(false),error:ref(''),
    crypto:{randomUUID:()=> 'stable-request'},emit:(...a:any[])=>emitted.push(a),load:async()=>{},
    $fetch:async(url:string,options:any)=>{sent.push({url,...options});if(sent.length===1)throw {data:{statusMessage:'Connection lost'}}},
  });t.after(h.stop)
  await h.context.save();await nextTick()
  assert.equal(h.context.saving.value,false);assert.equal(h.context.amount.value,400)
  assert.equal(h.context.error.value,'Connection lost');assert.ok(h.storage.get(key))
  await h.context.save()
  assert.equal(sent[0].body.requestId,sent[1].body.requestId)
  assert.equal(sent[1].headers['x-company-id'],'owner')
  assert.equal(h.storage.has(key),false);assert.deepEqual(emitted,[['saved']])
})
