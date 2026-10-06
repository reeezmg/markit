import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { harness } from './harness'
import { billOutstanding } from '../../utils/bill-credit'

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
  const h=harness('pages/erp/sales.vue',['handleEnterPayment'],{sales:ref([{id:'bill',paymentMethod:'Credit'}]),creditReceiptBill:ref(null),creditReceiptOpen:ref(false),isOpen:ref(false),activeBillInfo:ref(null),onPaymentStatusChange:()=>{throw Error('Unexpected status mutation')}});t.after(h.stop)
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
