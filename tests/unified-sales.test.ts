import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { ref } from 'vue'
import { salesView, salesViews, salesInvoiceRedirect, salesExportColumns } from '../utils/sales-view'
import { salesViewSql } from '../server/utils/sales-view'
import { invoiceBalance } from '../utils/invoice-flow'
import { harness, plain } from './billing/harness'

test('sales navigation validates views and preserves old invoice links and their selected company/search', () => {
  assert.deepEqual(salesViews.map(v=>v.label),['All sales','Pay now','Invoices','Unpaid / overdue'])
  assert.equal(salesView('invoices'),'invoices');assert.equal(salesView('untrusted'),'all')
  assert.deepEqual(salesInvoiceRedirect({entryCompany:'branch',q:'INV-42',view:'all'}),{path:'/erp/sales',query:{entryCompany:'branch',q:'INV-42',view:'invoices'}})
})

test('view predicates share real receipt balances and leave all-sales and online callers compatible', () => {
  assert.equal(salesViewSql(undefined).filter,'')
  assert.match(salesViewSql('paynow').filter,/invoice_code IS NULL/)
  assert.match(salesViewSql('invoices').filter,/invoice_code IS NOT NULL/)
  assert.match(salesViewSql('invoices').filter,/credit_user_id IS NULL/)
  assert.match(salesViewSql('unpaid').filter,/GREATEST/)
  assert.match(salesViewSql('unpaid').balance,/POS_CREDIT_RECEIPT/)
  assert.ok(!salesViewSql('unpaid').balance.includes('POS_CREDIT_REVERSED'))
  assert.match(salesViewSql('unpaid').balance,/p.company_id=b.company_id/)
  assert.match(salesViewSql('unpaid').overdue,/Asia\/Kolkata/)
  assert.match(salesViewSql('all','b.original_grand_total').received,/b.original_grand_total/)
  assert.throws(()=>salesViewSql('all; DROP TABLE bills'),/valid sales view/)
})

async function api(body: any) {
  const queries: any[]=[]
  const db={query:async(sql:string,values:any[])=>{
    queries.push({sql,values})
    if(sql.includes('COUNT(*) OVER()'))return {rows:[{id:'bill',total_count:1,grandTotal:1000,amountReceived:400,balanceDue:600,invoiceCode:'INV-42',splitPayments:[]}]}
    if(sql.includes('AS received'))return {rows:[{total:1000,received:400,balance:600,overdue:600}]}
    return {rows:[{credit_collections:400,total_collections:400}]}
  },release(){}}
  const src=readFileSync('server/api/billSale/findManyBills.post.ts','utf8')
  const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const modules:any={
    '~/server/utils/companyRequestScope':{useCompanyRequestSession:async()=>({data:{companyId:'company',allStores:false,cleanup:false}})},
    '~/server/utils/organizationReadScope':{getReadCompanyIds:async()=>['company']},
    '~/server/utils/report-bill-sales':{billSalesSql:()=> 'SELECT collections'},
    '~/server/utils/sales-view':{salesViewSql},
    '~/server/utils/invoice-flow':{invoiceSendStatusSql:'NULL'},
    '~/server/db':{pool:{connect:async()=>db}},
    h3:{defineEventHandler:(fn:any)=>fn,readBody:async()=>body,createError:({statusMessage}:any)=>Error(statusMessage)},
  }
  const module={exports:{} as any}
  new Function('require','module','exports',js)((name:string)=>{if(!modules[name])throw Error('Unknown import '+name);return modules[name]},module,module.exports)
  const result=await module.exports.default({})
  return {queries,result}
}
const request={companyId:'company',excludeMarkit:true,startDate:'2026-01-01',endDate:'2026-12-31',page:1,pageCount:5}
test('the real sales API applies tabs to both rows and totals before pagination and returns invoice balances',async()=>{
  for(const view of ['all','paynow','invoices','unpaid']){
    const {queries,result}=await api({...request,salesView:view,dateFilter:'all'})
    const [rows,totals,collections]=queries
    assert.equal(queries.length,3)
    assert.ok(rows.sql.includes('b.company_id = ANY($1::text[])'))
    const predicate=salesViewSql(view).filter
    if(predicate){assert.ok(rows.sql.includes(predicate));assert.ok(totals.sql.includes(predicate))}
    assert.ok(!rows.sql.includes('b.created_at BETWEEN'))
    assert.ok(rows.sql.includes('LIMIT $'));assert.deepEqual(rows.values[0],['company'])
    assert.equal(result.rows[0].invoiceCode,'INV-42');assert.equal(result.rows[0].balanceDue,600)
    assert.equal(result.totals.received,400);assert.equal(result.totals.balance,600);assert.equal(result.totals.overdue,600)
    assert.equal(collections.sql,'SELECT collections');assert.equal(result.collections.creditRepayments,400)
  }
  assert.ok((await api(request)).queries[0].sql.includes('b.created_at BETWEEN'))
  await assert.rejects(api({...request,salesView:'invalid'}),/valid sales view/)
  await assert.rejects(api({...request,dateFilter:'invalid'}),/valid date filter/)
})
test('invoice codes and subjects use bound search values; sorting stays within the server allowlist',async()=>{
  const needle="INV-42' OR true--", result=await api({...request,search:needle,salesView:'invoices',sortColumn:'balanceDue'})
  assert.ok(result.queries[0].sql.includes('b.invoice_code ILIKE $'))
  assert.ok(result.queries[0].sql.includes('b.subject ILIKE $'))
  assert.ok(!result.queries[0].sql.includes(needle));assert.ok(result.queries[0].values.includes('%'+needle+'%'))
  const hostile=await api({...request,sortColumn:'b.id; DELETE FROM bills'})
  assert.ok(hostile.queries[0].sql.includes('ORDER BY b.invoice_number DESC'))
  assert.ok((await api({...request,sortColumn:'__proto__'})).queries[0].sql.includes('ORDER BY b.invoice_number DESC'))
})

test('invoice exports include exact issued numbers, customers, due dates and remaining balances',()=>{
  const h=harness('pages/erp/sales.vue',['formatInvoiceForExport','formatDateTimeForExport','getBillDiscountAmount','buildSalesExportData'],{invoiceBalance,format:()=> '30 Oct 2026'})
  const {billRows}=h.context.buildSalesExportData([{invoiceNumber:42,billPrefix:'SALE',invoiceCode:'INV-42',grandTotal:1000,paymentMethod:'Credit',paymentStatus:'PENDING',client:{name:'Customer'},dueDate:'2026-11-10',payments:[{amount:400,status:'POS_CREDIT_RECEIPT'}]}])
  assert.equal(billRows[0].invoiceNumber,'INV-42');assert.equal(billRows[0].amountReceived,400);assert.equal(billRows[0].balanceDue,600)
  assert.equal(billRows[0].customer,'Customer');assert.equal(billRows[0].dueDate,'2026-11-10');assert.equal(billRows[0].paymentStatus,'Partially paid')
  assert.ok(salesExportColumns(true).some(c=>c.key==='balanceDue'))
  assert.ok(salesExportColumns(false).some(c=>c.key==='taxCollected'))
  h.stop()
})
test('export pagination retains the selected tab, company and filters when the screen changes mid-download',async()=>{
  const requests:any[]=[],view=ref('invoices'),dateFilter=ref('all'),search=ref('INV-42'),companyId=ref('company'),readIds=ref(['company'])
  const h=harness('pages/erp/sales.vue',['fetchFilteredSalesForExport'],{
    salesView:view,dateFilter,search,selectedStatus:ref([]),selectedPaymentMethods:ref([]),minGrandTotal:ref(null),maxGrandTotal:ref(null),
    getUtcDateRangeForApi:()=>({startDate:'2026-01-01',endDate:'2026-12-31'}),sort:ref({column:'invoiceNumber',direction:'desc'}),
    canUseCleanupToggle:ref(false),showCleanedValues:ref(false),useAuth:()=>({session:ref({companyId:'company'})}),companyScope:{companyId,readIds},
    $fetch:async(_url:string,options:any)=>{requests.push(plain(options));view.value='paynow';dateFilter.value='range';search.value='Changed';companyId.value='other';readIds.value=['other'];return {total:2,rows:[{id:'row'+requests.length}]}}
  })
  assert.equal((await h.context.fetchFilteredSalesForExport()).length,2)
  for(const call of requests){assert.equal(call.body.salesView,'invoices');assert.equal(call.body.dateFilter,'all');assert.equal(call.body.search,'INV-42');assert.equal(call.headers['x-company-id'],'company')}
  assert.deepEqual(requests.map(c=>c.body.page),[1,2]);h.stop()
})
test('unified columns retain invoice terms, due dates and sending actions without changing sale columns',()=>{
  const invoiceView=ref(false)
  const h=harness('pages/erp/sales.vue',['getColumns','columns'],{invoiceView,isMobile:ref(false),useAuth:()=>({session:ref({})}),canSeeCleanupRealValues:ref(false)})
  assert.ok(!h.context.columns.value.some((c:any)=>c.key==='dueDate'))
  invoiceView.value=true
  for(const key of ['dueDate','amountReceived','balanceDue','invoicePaymentTerms','subject','sendStatus'])assert.ok(h.context.columns.value.some((c:any)=>c.key===key))
  h.stop()
})
