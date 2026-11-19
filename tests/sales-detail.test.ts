import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {ref} from 'vue'
import {createError} from 'h3'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {harness,read} from './billing/harness'

test('sales list and its Bill/History side panel compile',()=>{
  for(const file of ['pages/erp/sales.vue','components/Sales/DetailPanel.vue']) {
    const {descriptor,errors}=parse(read(file),{filename:file})
    assert.deepEqual(errors,[])
    compileScript(descriptor,{id:file})
    assert.deepEqual(compileTemplate({source:descriptor.template!.content,filename:file,id:file}).errors,[])
  }
})

test('row clicks open the side panel while interactive table controls retain their actions',t=>{
  const h=harness('pages/erp/sales.vue',['rememberSaleClick','selectSale','selectSaleRow','openBill'],{selectedSale:ref(null),ignoreSaleClick:false,sales:ref([{id:'bill',companyId:'branch'}])});t.after(h.stop)
  h.context.rememberSaleClick({target:{closest:()=>({})}})
  h.context.selectSaleRow({id:'bill'})
  assert.equal(h.context.selectedSale.value,null)
  h.context.rememberSaleClick({target:{closest:()=>null}})
  h.context.selectSaleRow({id:'bill'})
  assert.equal(h.context.selectedSale.value.id,'bill')
  h.context.openBill('bill')
  assert.equal(h.context.selectedSale.value.companyId,'branch')
})

test('slow responses cannot replace another selected bill and requests use that bill company',async t=>{
  const pending:any[]=[],props={bill:{id:'first',companyId:'one'},fetcher:(url:string,options:any)=>new Promise(resolve=>pending.push({url,options,resolve}))}
  const h=harness('components/Sales/DetailPanel.vue',['receiptVersion','headers','loadBill'],{props,receipt:ref(null),receiptError:ref(''),receiptLoading:ref(false)});t.after(h.stop)
  const first=h.context.loadBill()
  props.bill={id:'second',companyId:'two'}
  const second=h.context.loadBill()
  assert.equal(pending[1].options.headers['x-company-filter'],'two')
  pending[1].resolve({invoiceNumber:2});await second
  pending[0].resolve({invoiceNumber:1});await first
  assert.equal(h.context.receipt.value.invoiceNumber,2)
  assert.equal(h.context.receiptLoading.value,false)
})

test('history loads the selected page and shows a readable error on rejection',async t=>{
  const requests:any[]=[]
  const h=harness('components/Sales/DetailPanel.vue',['receiptVersion','headers','loadHistory'],{
    props:{bill:{id:'bill',companyId:'branch'},fetcher:async(url:string,options:any)=>{requests.push(options);throw {statusCode:403}}},
    histories:ref([{id:'old'}]),historyTotal:ref(25),historyPage:ref(2),historyError:ref(''),historyLoading:ref(false),
  });t.after(h.stop)
  await h.context.loadHistory()
  assert.equal(requests[0].query.page,2)
  assert.equal(requests[0].query.id,'bill')
  assert.equal(h.context.histories.value.length,0)
  assert.match(h.context.historyError.value,/permission/)
  assert.equal(h.context.historyLoading.value,false)
})

function historyEndpoint({foreign=false,cleanup=false,page='1'}={}) {
  const calls:any[]=[]
  const client={release(){},async query(sql:string,args:any[]=[]) {
    calls.push({sql,args})
    if(sql.includes('FROM bills')) return {rows:foreign?[]:[{id:'bill',company_id:'branch'}]}
    if(sql.includes('count(*)')) return {rows:[{total:25}]}
    if(sql.includes('FROM bill_history')) return {rows:[{id:'snapshot',data:{grand_total:100}}]}
    return {rows:[]}
  }}
  const file='server/api/billSale/history.get.ts'
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
  const body=source.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(source)).join('\n').replace('export default ','globalThis.handler = ')
  const context:any={createError,defineEventHandler:(fn:any)=>fn,getQuery:()=>({id:'bill',page}),getReadCompanyIds:async()=>['branch'],requireAuthSession:async()=>({data:{cleanup}}),pool:{connect:async()=>client}}
  vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context)
  return {calls,run:()=>context.handler({})}
}

test('history endpoint scopes its owner, filters cleanup and paginates a read-only snapshot',async()=>{
  const f=historyEndpoint({page:'2'})
  const result=await f.run()
  assert.equal(result.total,25)
  assert.equal(f.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(f.calls[1].args[1][0],'branch')
  assert.equal(f.calls[1].args[2],false)
  const history=f.calls.find(c=>c.sql.includes('ORDER BY'))
  assert.match(history.sql,/changed_at DESC,id DESC/)
  assert.equal(history.args[2],20)
  assert.equal(f.calls.at(-1).sql,'COMMIT')
})

test('foreign bills are rejected before snapshots are read and invalid pages do not query',async()=>{
  const f=historyEndpoint({foreign:true})
  await assert.rejects(f.run(),(e:any)=>e.statusCode===404)
  assert.equal(f.calls.some(c=>c.sql.includes('FROM bill_history')),false)
  assert.equal(f.calls.at(-1).sql,'ROLLBACK')
  const invalid=historyEndpoint({page:'0'})
  await assert.rejects(invalid.run(),(e:any)=>e.statusCode===400)
  assert.equal(invalid.calls.length,0)
})
