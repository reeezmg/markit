import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { pool } from '../server/db'
import { writeSalesOrder, readSalesOrder, salesOrderListQuery } from '../server/utils/sales-orders'
import { normalizeSalesOrder, salesOrderForEditor, salesOrderFromEditor, salesOrderStatuses } from '../utils/sales-order'
import { newQuoteLine } from '../utils/erp-quote'
import { quoteLocalKey, readQuoteLocalDraft } from '../utils/quote-draft'
import { emptyQuotePreferences } from '../utils/quote-preferences'

function input() {
  return { clientId:'customer',orderDate:'2026-10-29',expectedShipmentDate:'2026-11-29',referenceNumber:'PO-1',subject:'Office chairs',
    salesperson:'Alex',status:'CONFIRMED',paymentTerms:'Net 30',deliveryMethod:'Courier',notes:'Thank you',termsAndConditions:'Prices agreed',
    discount:10,discountType:'percent',adjustment:-0.5,items:[{...newQuoteLine('line'),variantId:'variant',name:'Chair',quantity:2,rate:118,discount:10,tax:18,barcode:'ABC',size:'M'}],requestId:'request-1' }
}
function fixture(options: any = {}) {
  const calls: any[] = [], state: any = { order:null,items:[],metadata:{},receipts:{},preferences:{...emptyQuotePreferences(),...options.preferences} }
  let backup: any
  const rows = (rows: any[] = [], rowCount = rows.length) => ({ rows,rowCount })
  const db = { release(){}, async query(sql: string, values: any[] = []): Promise<any> {
    calls.push({sql,values})
    if(sql==='BEGIN') backup=structuredClone(state)
    if(sql==='ROLLBACK'&&backup)Object.assign(state,backup)
    if(sql.includes('SELECT "after" FROM accountant_v2_accountant_audit'))return rows(state.receipts[values[0]]?[{after:state.receipts[values[0]]}]:[])
    if(sql.includes('INSERT INTO accountant_v2_accountant_audit')){state.receipts[values[0]]=JSON.parse(values[5]);return rows([],1)}
    if(sql.includes('SELECT id FROM companies'))return rows([{id:'company'}])
    if(sql.includes('SELECT preference_value'))return rows([{preference_value:state.preferences}])
    if(sql.includes('SELECT s.id,s.status'))return rows(state.order&&state.order.id===values[0]&&values[1]==='company'?[{id:values[0],status:state.order.status,revision:state.metadata.revision}]:[])
    if(sql.includes('SELECT c.name,c.phone'))return rows(options.foreignCustomer?[]:[{name:'Customer',phone:'1234567890'}])
    if(sql.includes('SELECT v.id FROM variants'))return rows(options.foreignVariant?[]:[{id:'variant'}])
    if(sql.includes('GREATEST(COALESCE(sales_order_counter'))return rows([{prefix:'SO',counter:1}])
    if(sql.includes('SELECT 1 FROM sales_orders'))return rows(values[1]==='SO-00001'?[{exists:true}]:[])
    if(sql.startsWith('INSERT INTO sales_orders')){state.order={id:values[0],orderNumber:values[2],invoiced:false,paymentStatus:'UNPAID'};return rows([],1)}
    if(sql.startsWith('UPDATE sales_orders SET client_id')){
      Object.assign(state.order,{clientId:values[2],orderDate:values[3],expectedShipmentDate:values[4],referenceNumber:values[5],paymentTerms:values[6],deliveryMethod:values[7],salesperson:values[8],status:values[9],notes:values[10],termsAndConditions:values[11],discount:values[12],discountType:values[13],adjustment:values[14],subTotal:values[15],total:values[16]});return rows([],1)
    }
    if(sql.startsWith('DELETE FROM sales_order_items')){state.items=[];return rows([],1)}
    if(sql.startsWith('INSERT INTO sales_order_items')){
      if(options.failItems)throw Error('Line save failed')
      state.items.push({id:values[0],name:values[3],description:values[4],quantity:values[5],rate:values[6],amount:values[7],unit:values[8],variantId:values[9]});return rows([],1)
    }
    if(sql.includes('INSERT INTO general_preferences')){state.metadata=JSON.parse(values[3]);return rows([],1)}
    if(sql.includes('SELECT order_number AS'))return rows([{orderNumber:state.order.orderNumber}])
    if(sql.includes('FROM sales_orders s'))return rows(state.order&&state.order.id===values[0]&&values[1]==='company'?[{...state.order,clientName:'Customer',clientPhone:'1234567890',metadata:state.metadata}]:[])
    if(sql.includes('FROM sales_order_items i'))return rows(state.items)
    return rows([],1)
  } }
  return {db,calls,state}
}
test('sales order pricing, numbering and replay are scoped and have no bill, stock or payment effects', async()=>{
  const f=fixture(), body={...input(),total:999,subTotal:999}
  const saved=await writeSalesOrder(f.db,{companyId:'company',userId:'staff'},body)
  assert.equal(saved.orderNumber,'SO-00002');assert.equal(f.state.order.total,190.66);assert.equal(f.state.order.subTotal,212.4)
  assert.equal(f.state.order.invoiced,false);assert.equal(f.state.order.paymentStatus,'UNPAID')
  assert.equal(Object.values(f.state.metadata.lines as any)[0].tax,18)
  assert.deepEqual(f.calls.find(c=>c.sql.startsWith('UPDATE companies')).values,['company',3])
  assert.deepEqual(await writeSalesOrder(f.db,{companyId:'company',userId:'staff'},body),saved)
  assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT INTO sales_orders')).length,1)
  await assert.rejects(writeSalesOrder(f.db,{companyId:'company',userId:'staff'},{...body,subject:'Different'}),{statusCode:409})
  for(const call of f.calls){assert.doesNotMatch(call.sql,/\b(?:CREATE|ALTER|DROP|TRUNCATE)\b/);assert.doesNotMatch(call.sql,/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:bills|entries|items|payments|accountant_v2_journals)\b/)}
  const detail=await readSalesOrder(f.db,'company',saved.id)
  assert.equal(detail.subject,'Office chairs');assert.equal(detail.items[0].discount,10);assert.equal(detail.items[0].tax,18);assert.equal(detail.items[0].barcode,'ABC')
  await assert.rejects(readSalesOrder(f.db,'foreign',saved.id),{statusCode:404})
})
test('foreign references, stale revisions and terminal edit locks reject before source mutation',async()=>{
  for(const options of [{foreignCustomer:true},{foreignVariant:true}])await assert.rejects(writeSalesOrder(fixture(options).db,{companyId:'company',userId:'staff'},input()),{statusCode:400})
  const f=fixture(),saved=await writeSalesOrder(f.db,{companyId:'company',userId:'staff'},input())
  await assert.rejects(writeSalesOrder(f.db,{companyId:'company',userId:'staff'},{...input(),requestId:'edit',revision:'stale'},saved.id),{statusCode:409})
  f.state.order.status='CLOSED'
  await assert.rejects(writeSalesOrder(f.db,{companyId:'company',userId:'staff'},{...input(),requestId:'edit-2',revision:saved.revision},saved.id),{statusCode:409})
  f.state.preferences.allowAcceptedEdits=true
  await writeSalesOrder(f.db,{companyId:'company',userId:'staff'},{...input(),requestId:'edit-3',revision:saved.revision},saved.id)
  assert.equal(f.state.order.status,'CONFIRMED')
})
test('sales order API rolls back a failed line save and rejects inaccessible companies',async()=>{
  const originalAuth=(globalThis as any).requireAuthSession,originalConnect=pool.connect
  const handler=(await import('../server/api/sales-orders/index.post')).default as any
  const f=fixture({failItems:true})
  const event=(company='company')=>{const json=JSON.stringify(input()),req:any=Readable.from([Buffer.from(json)]);req.url='/api/sales-orders';req.method='POST';req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(json)),'x-company-id':company};const e=createEvent(req,{} as any);e.context.authorizedCompanyIds=Promise.resolve(['company']);return e}
  try{
    ;(globalThis as any).requireAuthSession=async()=>({data:{companyId:'company',id:'staff',role:'admin'}});pool.connect=(async()=>f.db) as any
    await assert.rejects(handler(event()),/Line save failed/);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.state.order,null)
    await assert.rejects(handler(event('foreign')),{statusCode:403})
  }finally{(globalThis as any).requireAuthSession=originalAuth;pool.connect=originalConnect}
})
test('list filters and local drafts use their document and company boundaries',()=>{
  const query=salesOrderListQuery('company',{q:'customer',status:'CONFIRMED',sort:'total',from:'2026-10-01',min:'10'})
  assert.equal(query.values[0],'company');assert.match(query.sql,/s\.company_id=\$1/);assert.match(query.sql,/sales-orders/)
  assert.throws(()=>salesOrderListQuery('company',{status:'SENT'}))
  assert.throws(()=>normalizeSalesOrder({...input(),status:'ACCEPTED'}))
  const mapped=salesOrderFromEditor(salesOrderForEditor(input()))
  assert.equal(mapped.orderDate,input().orderDate);assert.equal(mapped.deliveryMethod,'Courier');assert.ok(!('quoteDate' in mapped))
})
test('incomplete local drafts restore typed values and reject corruption, cross-document statuses and mismatched customer selections',()=>{
  const form=salesOrderForEditor(input()),draft={version:1,requestId:randomUUID(),form:{...form,status:'DRAFT',quoteDate:'',items:[{...input().items[0],rate:''}]},customer:{id:'customer',name:'Customer',phone:'123'},customerSearch:'Customer',staffSearch:'Al',productSearch:'ABC'}
  const restored=readQuoteLocalDraft(JSON.stringify(draft));assert.ok(restored);assert.equal(restored.form.items[0].rate,'');assert.equal(restored.staffSearch,'Al')
  assert.equal(readQuoteLocalDraft('{bad'),null);assert.equal(readQuoteLocalDraft(JSON.stringify({...draft,version:2})),null)
  assert.equal(readQuoteLocalDraft(JSON.stringify({...draft,form:{...draft.form,status:'CONFIRMED'}})),null)
  assert.ok(readQuoteLocalDraft(JSON.stringify({...draft,form:{...draft.form,status:'CONFIRMED'}}),salesOrderStatuses))
  assert.equal(readQuoteLocalDraft(JSON.stringify({...draft,customer:{id:'other',name:'Other',phone:'0'}})),null)
  assert.notEqual(quoteLocalKey('draft','a','user'),quoteLocalKey('draft','b','user'));assert.notEqual(quoteLocalKey('draft','a','user'),quoteLocalKey('draft','a','other'))
  assert.notEqual(quoteLocalKey('draft','a','user'),quoteLocalKey('draft','a','user','sales-order'))
})
test('read-only database plans sales order statements without executing writes', {skip:process.env.SALES_ORDER_READONLY_DATABASE!=='1'},async()=>{
  const f=fixture(),saved=await writeSalesOrder(f.db,{companyId:'company',userId:'staff'},input());await readSalesOrder(f.db,'company',saved.id)
  f.calls.push(salesOrderListQuery('company',{}))
  const dotenv=await import('dotenv');dotenv.config({quiet:true} as any)
  const {Client}=await import('pg'),db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000})
  try{await db.connect();await db.query('BEGIN READ ONLY');for(const call of f.calls)if(/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/.test(call.sql))await db.query('EXPLAIN '+call.sql,call.values);await db.query('ROLLBACK')}finally{await db.end()}
})
