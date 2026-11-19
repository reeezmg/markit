import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref, nextTick } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { harness, read } from './billing/harness'
import { historyEventWhere, historyInvoiceWhere, historySnapshot } from '../utils/sales-history'

test('history uses full Indian calendar days with an exclusive next-day boundary',()=>{
  const where=historyEventWhere(false,{start:new Date(2026,10,9),end:new Date(2026,10,9)})
  assert.deepEqual(where,{precedence:{not:true},changedAt:{gte:'2026-11-08T18:30:00.000Z',lt:'2026-11-09T18:30:00.000Z'}})
  assert.deepEqual(historyEventWhere(true,null),{})
  assert.deepEqual(historyEventWhere(false,null),{precedence:{not:true}})
})

test('invoice search normalizes inputs and rejects invalid or overflowing integers',()=>{
  assert.deepEqual(historyInvoiceWhere(' 792 '),{invoiceNumber:792})
  assert.deepEqual(historyInvoiceWhere(''),{})
  for(const value of ['x',-1,'1.5','2147483648']) assert.deepEqual(historyInvoiceWhere(value),{id:{in:[]}})
})

test('snapshot money is numeric, zero quantity survives and both snapshot formats load splits',()=>{
  for(const data of [
    {grand_total:'150.50',payment_method:'Split',split_payments:[{method:'UPI',amount:'100.50'},{method:'Credit',amount:50}]},
    {grandTotal:150.5,paymentMethod:'Split',splitPayments:[{method:'UPI',amount:100.5},{method:'Credit',amount:50}]},
  ]) {
    const snapshot=historySnapshot({...data,subtotal:'150.50',entries:[{qty:0,rate:'100',tax:'5'}]})
    assert.equal(snapshot.grandTotal,150.5)
    assert.equal(snapshot.entries[0].qty,0)
    assert.equal(snapshot.entries[0].rate,100)
    assert.equal(snapshot.splitPayments.reduce((sum:number,p:any)=>sum+p.amount,0),150.5)
  }
})

test('list applies the same event filter to matching bills and expanded events with stable ordering',t=>{
  const h=harness('pages/saleshistory/index.vue',['queryArgs'],{
    useAuth:()=>({session:ref({companyId:'branch',cleanup:false})}),historyEventWhere,historyInvoiceWhere,
    search:ref('792'),selectedStatus:ref([]),dateMode:ref('range'),selectedDate:ref({start:new Date(2026,10,9),end:new Date(2026,10,9)}),
    page:ref(2),pageCount:ref('20'),sort:ref({column:'updatedAt',direction:'desc'}),
  });t.after(h.stop)
  const query=h.context.queryArgs.value
  assert.deepEqual(query.where.billHistories.some,query.include.billHistories.where)
  assert.equal(query.where.billHistories.some.changedAt.lt,'2026-11-09T18:30:00.000Z')
  assert.equal(query.include.billHistories.orderBy[0].changedAt,'desc')
  assert.equal(query.include.billHistories.orderBy[1].id,'desc')
  assert.equal(query.skip,20)
  assert.equal(JSON.stringify(query.where).includes('updatedAt'),false)
})

test('filter and page-size changes reset pagination and expansion',async t=>{
  const state={search:ref(''),selectedStatus:ref([]),selectedDate:ref({start:new Date(),end:new Date()}),dateMode:ref('range'),pageCount:ref('20'),sort:ref({column:'updatedAt',direction:'desc'}),page:ref(5),expand:ref({openedRows:['bill'],row:{id:'bill'}})}
  const h=harness('pages/saleshistory/index.vue',['$watch:[search, selectedStatus, selectedDate, dateMode, pageCount, sort]'],state);t.after(h.stop)
  for(const [key,value] of [['search','792'],['selectedStatus',[{value:'PAID'}]],['dateMode','all'],['pageCount','5']] as const) {
    state.page.value=5
    ;(state[key] as any).value=value
    await nextTick()
    assert.equal(state.page.value,1)
    assert.equal(state.expand.value.openedRows.length,0)
  }
})

test('restore guards duplicate clicks, keeps the row company and refreshes rows and count',async t=>{
  let resolve!:()=>void
  const pending=new Promise<void>(r=>resolve=r),requests:any[]=[],refreshes:string[]=[]
  const h=harness('pages/saleshistory/index.vue',['restoreBill'],{
    restoringBillId:ref(''),companyScope:{fetch:async(url:string,options:any)=>{requests.push({url,...options});await pending}},
    toast:{add(){}},refetch:async()=>refreshes.push('rows'),refetchCount:async()=>refreshes.push('count'),
  });t.after(h.stop)
  const first=h.context.restoreBill({id:'bill',companyId:'branch'})
  await h.context.restoreBill({id:'bill',companyId:'branch'})
  assert.equal(requests.length,1)
  assert.equal(requests[0].headers['x-company-id'],'branch')
  resolve();await first
  assert.deepEqual(refreshes,['rows','count'])
  assert.equal(h.context.restoringBillId.value,'')
})

test('detail loads historical split amounts and numeric totals into the actual page state',t=>{
  const state:any={bill:ref({changedAt:'2026-11-09T12:00:00Z',data:{subtotal:'150',grand_total:'150',payment_method:'Split',split_payments:[{method:'UPI',amount:'100'},{method:'Credit',amount:'50'}],entries:[{qty:0,rate:'75',value:0,category:{id:'old',name:'Archived category'}}]}}),categories:ref([]),historySnapshot,paymentOptions:['Cash','UPI','Card','Credit','Bank','Cheque']}
  for(const key of ['discount','selected','clientId','clientName','phoneNo','paymentMethod','date','grandTotal','subtotal','returnAmt','voucherNo','splitPayments','tempSplits','items']) state[key]=ref(null)
  const h=harness('pages/saleshistory/[billId].vue',['$watch:[bill, categories]'],state);t.after(h.stop)
  assert.equal(state.grandTotal.value,150)
  assert.equal(state.tempSplits.value.UPI.amount,100)
  assert.equal(state.tempSplits.value.Credit.amount,50)
  assert.equal(state.items.value[0].qty,0)
  assert.equal(state.items.value[0].category[0].name,'Archived category')
})

test('restore errors clear busy state and never show success',async t=>{
  const toasts:any[]=[]
  const h=harness('pages/saleshistory/index.vue',['restoreBill'],{
    restoringBillId:ref(''),companyScope:{fetch:async()=>{throw {statusCode:409,data:{statusMessage:'Cannot restore: no remaining uses on the generated coupon'}}}},
    toast:{add:(value:any)=>toasts.push(value)},refetch:()=>{throw Error('Unexpected refresh')},refetchCount:()=>{throw Error('Unexpected refresh')},
  });t.after(h.stop)
  await h.context.restoreBill({id:'bill',companyId:'branch'})
  assert.equal(h.context.restoringBillId.value,'')
  assert.equal(toasts.length,1)
  assert.equal(toasts[0].color,'red')
})

test('history pages compile and quantity precedes rate in rendered detail cells',()=>{
  for(const file of ['pages/saleshistory.vue','pages/saleshistory/index.vue','pages/saleshistory/[billId].vue']) {
    const {descriptor,errors}=parse(read(file),{filename:file})
    assert.deepEqual(errors,[])
    compileScript(descriptor,{id:file})
    assert.deepEqual(compileTemplate({source:descriptor.template!.content,filename:file,id:file}).errors,[])
  }
  const detail=read('pages/saleshistory/[billId].vue')
  assert.ok(detail.indexOf('v-model="row.qty"')<detail.indexOf('v-model="row.rate"'))
})
