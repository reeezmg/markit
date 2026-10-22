import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';
import {QueryClient,VueQueryPlugin,useQuery,useQueryClient,dehydrate,hydrate} from '@tanstack/vue-query';
function component(scope:any,fail=false,child:any=null){
 const source=readFileSync(process.env.EXPENSE_QUERY_SOURCE||'composables/useExpenses.ts','utf8'),ast=ts.createSourceFile('expenses.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='useExpenseList')!.getText(ast).replace('export function','function');
 const js=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const useList=new Function('useQuery','useQueryClient','computed','onServerPrefetch','useCompanyScope','LIST_KEY',js+';return useExpenseList;')(useQuery,useQueryClient,Vue.computed,Vue.onServerPrefetch,()=>scope,['expenses','list']);
 return{setup(){const q=useList(Vue.ref({page:1}));return()=>child?Vue.h('div',[Vue.h('p',[q.isLoading.value,q.rows.value.length,q.total.value].join('|')),Vue.h(child)]):Vue.h('p',[q.isLoading.value,q.rows.value.length,q.total.value].join('|'));}};
}
for(const fail of [false,true])test('expense '+(fail?'failure':'rows')+' completes SSR before its cache is transferred',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{staleTime:300000,retry:false}}});let calls=0;
 const scope={companyId:Vue.ref('head'),readIds:Vue.ref(['head']),auth:{session:Vue.ref({companyId:'head'})},ready:Promise.resolve(),fetch:async()=>{calls++;await new Promise(done=>setTimeout(done,20));if(fail)throw Error('Fixture dependency missing');return{rows:[{id:'fixture-expense'}],total:1};}};
 const app=Vue.createSSRApp(component(scope,fail));app.use(VueQueryPlugin,{queryClient:client});
 try{
  assert.equal(await renderToString(app),fail?'<p>false|0|0</p>':'<p>false|1|1</p>');assert.equal(calls,1);
  if(!fail){const browserClient=new QueryClient({defaultOptions:{queries:{staleTime:300000,retry:false}}});hydrate(browserClient,dehydrate(client));const browser=Vue.createSSRApp(component(scope));browser.use(VueQueryPlugin,{queryClient:browserClient});try{assert.equal(await renderToString(browser),'<p>false|1|1</p>');assert.equal(calls,1);}finally{browserClient.clear();}}
 }finally{client.clear();}
});

test('expense SSR wait does not restart a failed read when a nested scope reference refreshes',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{staleTime:300000,retry:false}}});let calls=0;
 const scope={companyId:Vue.ref('head'),readIds:Vue.ref(['head']),auth:{session:Vue.ref({companyId:'head'})},ready:Promise.resolve(),fetch:async()=>{calls++;await new Promise(done=>setTimeout(done,calls===1?5:100));throw Error('Fixture dependency missing');}};
 const Child={setup(){scope.readIds.value=[...scope.readIds.value];Vue.onServerPrefetch(()=>new Promise(done=>setTimeout(done,20)));return()=>Vue.h('span');}};
 const app=Vue.createSSRApp(component(scope,true,Child));app.use(VueQueryPlugin,{queryClient:client});
 try{
  assert.equal(await renderToString(app),'<div><p>false|0|0</p><span></span></div>');
  assert.equal(calls,1,'A settled SSR error must remain idle while nested components render');
  assert.ok(client.getQueryCache().getAll().every(q=>q.state.status==='error'&&q.state.fetchStatus==='idle'));
 }finally{await new Promise(done=>setTimeout(done,110));client.clear();}
});
