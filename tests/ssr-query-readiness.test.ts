import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {parse,compileScript} from '@vue/compiler-sfc';
import ts from 'typescript';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';
import {QueryClient,VueQueryPlugin,useQuery,useQueryClient,dehydrate,hydrate} from '@tanstack/vue-query';
import {appendCompanyWhere} from '../utils/companyWhere';
import {provideHooksContext} from '@zenstackhq/tanstack-query/runtime-v5/vue';
import {useFindManyCollection} from '../lib/hooks/collection';

function adapter({head=false,loadCompanies=false,server=true,companyData=undefined as any}={}) {
  const source=ts.transpileModule(readFileSync(process.env.COMPANY_SCOPE_SOURCE || 'composables/useCompanyScope.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm,'').replace(/export (async )?function /g,'$1function ');
  const bindings={computed:Vue.computed,getCurrentInstance:Vue.getCurrentInstance,inject:Vue.inject,provide:Vue.provide,ref:Vue.ref,
    shallowRef:Vue.shallowRef,unref:Vue.unref,toValue:Vue.toValue,onServerPrefetch:server?Vue.onServerPrefetch:()=>{},useQueryClient,appendCompanyWhere,
    useRoute:()=>({path:'/products',params:{},query:{}}),
    useNuxtApp:()=>({$auth:{session:Vue.ref({companyId:head?'head':'branch',role:'admin'})}}),
    useRequestFetch:()=>async()=>({}),useFetch:()=>{
      const companies=[{id:'head',name:'Head',parentCompanyId:null,isHeadOffice:true},{id:'branch',name:'Branch',parentCompanyId:'head',isHeadOffice:false}];
      if(!loadCompanies)return{data:companyData||Vue.ref(companies)};
      const data=Vue.ref<any>();const pending=pause(20).then(()=>{data.value=companies;});
      if(server)Vue.onServerPrefetch(()=>pending);return Object.assign(pending,{data});
    },
  };
  const exports = new Function(...Object.keys(bindings),source+';return {withCompanyRead,useCompanyScope};')(...Object.values(bindings));
  return Object.assign(exports.withCompanyRead,{useCompanyScope:exports.useCompanyScope});
}
const pause=(ms:number)=>new Promise(done=>setTimeout(done,ms));

test('settled SSR errors stay settled when nested company reads refresh the same scope',async()=>{
  const data=Vue.ref([{id:'head',name:'Head',parentCompanyId:null,isHeadOffice:true},{id:'branch',name:'Branch',parentCompanyId:'head',isHeadOffice:false}]);
  const scoped=adapter({head:true,companyData:data}),client=new QueryClient({defaultOptions:{queries:{staleTime:300000,retry:false}}});let calls=0;
  const Child={setup(){data.value=data.value.map(c=>({...c}));Vue.onServerPrefetch(()=>pause(20));return()=>Vue.h('span');}};
  const Parent={setup(){scoped.useCompanyScope('table');const q=scoped(useFindManyCollection,'Collection')({where:{companyId:'head'}},{retry:false});return()=>Vue.h('div',[Vue.h('p',q.error.value?'query-error':'loading'),Vue.h(Child)]);}};
  const Root={setup(){provideHooksContext({endpoint:'https://fixture.test/api/model',fetch:async()=>{calls++;await pause(calls===1?5:100);return new Response(JSON.stringify({error:{code:'P2021',message:'Fixture dependency unavailable'}}),{status:400,headers:{'content-type':'application/json'}});}});return()=>Vue.h(Parent);}};
  const app=Vue.createSSRApp(Root);app.use(VueQueryPlugin,{queryClient:client});
  try{
    assert.equal(await renderToString(app),'<div><p>query-error</p><span></span></div>');
    assert.equal(calls,1,'The completed SSR wait must not leave a suspense watcher that restarts a failed read');
    assert.equal(client.getQueryCache().getAll().filter(q=>q.state.status==='error').length,1);
    assert.ok(client.getQueryCache().getAll().every(q=>q.state.fetchStatus==='idle'));
  }finally{await pause(110);client.clear();}
});

for(const [label,path,override] of [
  ['supplier page','pages/distributor/index.vue','DISTRIBUTOR_PAGE_SOURCE'],
  ['expense table','components/Expense/ExpenseList.vue','EXPENSE_LIST_SOURCE'],
])test(label+' creates its first client query after company access is ready',async()=>{
  const source=readFileSync(process.env[override]||path,'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('page.ts',source,ts.ScriptTarget.Latest,true);
  const prefix=ast.statements.filter(n=>(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='companyScope'))||
    (ts.isExpressionStatement(n)&&ts.isAwaitExpression(n.expression)&&n.expression.expression.getText(ast)==='companyScope.ready')).map(n=>n.getText(ast)).join('\n');
  const descriptor=parse('<script setup lang="ts">'+prefix+'\nconst query = sdkRead({where:{companyId:"head"}},{retry:false});<\/script>',{filename:'scope-page.vue'}).descriptor;
  const script=compileScript(descriptor,{id:'scope-page'}).content;
  const js=ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const defaults={defaultOptions:{queries:{staleTime:300000,retry:false,retryOnMount:false}}};
  const serverClient=new QueryClient(defaults),browserClient=new QueryClient(defaults);
  function page(client:QueryClient,server:boolean){
    const scoped=adapter({head:true,loadCompanies:true,server});let calls=0;
    const module={exports:{} as any},require=createRequire(import.meta.url);
    new Function('require','exports','module','useCompanyScope','sdkRead',js)((name:string)=>name==='vue'?Vue:require(name),module.exports,module,scoped.useCompanyScope,scoped(useFindManyCollection,'Collection'));
    const component=module.exports.default;
    component.render=function(this:any){const q=this.$.setupState.query;return Vue.h('p',String(q.isLoading.value)+'|'+String(!!q.error.value));};
    const Root={setup(){provideHooksContext({endpoint:'https://fixture.test/api/model',fetch:async()=>{calls++;await pause(60);return new Response(JSON.stringify({error:{code:'P2021',message:'Fixture dependency unavailable'}}),{status:400,headers:{'content-type':'application/json'}});}});return()=>Vue.h(component);}};
    const app=Vue.createSSRApp(Root);app.use(VueQueryPlugin,{queryClient:client});return{app,calls:()=>calls};
  }
  try{
    const server=page(serverClient,true),html=await renderToString(server.app);
    hydrate(browserClient,dehydrate(serverClient,{shouldDehydrateQuery:q=>q.state.status==='error'}));
    const browser=page(browserClient,false);assert.equal(await renderToString(browser.app),html);assert.equal(html,'<p>false|true</p>');assert.equal(browser.calls(),0);
  }finally{await pause(35);serverClient.clear();browserClient.clear();}
});

test('SDK SSR waits for accessible companies before rendering the final scope query',async()=>{
  const serverClient=new QueryClient({defaultOptions:{queries:{staleTime:300000}}}),browserClient=new QueryClient({defaultOptions:{queries:{staleTime:300000}}});
  function scopedApp(client:QueryClient,server:boolean){
    const withRead=adapter({head:true,loadCompanies:server});let calls=0;
    const Child={setup(){withRead.useCompanyScope('table');const query=withRead(useFindManyCollection,'Collection')({where:{companyId:'head'}});return()=>Vue.h('p',String(query.data.value?.length??'pending'));}};
    const Root={setup(){provideHooksContext({endpoint:'https://fixture.test/api/model',fetch:async(input:any)=>{
      calls++;await pause(5);const wide=decodeURIComponent(String(input)).includes('branch');
      return new Response(JSON.stringify({data:wide?[{id:'head'},{id:'branch'}]:[{id:'head'}]}),{headers:{'content-type':'application/json'}});
    }});return()=>Vue.h(Child);}};
    const app=Vue.createSSRApp(Root);app.use(VueQueryPlugin,{queryClient:client});return{app,calls:()=>calls};
  }
  try{
    const server=scopedApp(serverClient,true),html=await renderToString(server.app);await pause(40);
    hydrate(browserClient,dehydrate(serverClient));const browser=scopedApp(browserClient,false);
    assert.equal(await renderToString(browser.app),html);assert.equal(html,'<p>2</p>');assert.equal(browser.calls(),0);
  }finally{serverClient.clear();browserClient.clear();}
});

test('actual generated SDK empty rows complete SSR and hydrate the same query cache',async()=>{
  const withRead=adapter(),serverClient=new QueryClient({defaultOptions:{queries:{staleTime:300000}}}),browserClient=new QueryClient({defaultOptions:{queries:{staleTime:300000}}});
  function sdkApp(client:QueryClient){
    let calls=0;
    const Child={setup(){const query=withRead(useFindManyCollection,'Collection')({});return()=>Vue.h('p',String(query.isLoading.value)+'|'+(query.data.value?.length??'pending'));}};
    const Root={setup(){provideHooksContext({endpoint:'https://fixture.test/api/model',fetch:async()=>{calls++;await pause(25);return new Response(JSON.stringify({data:[]}),{headers:{'content-type':'application/json'}});}});return()=>Vue.h(Child);}};
    const app=Vue.createSSRApp(Root);app.use(VueQueryPlugin,{queryClient:client});return{app,calls:()=>calls};
  }
  try{
    const server=sdkApp(serverClient),html=await renderToString(server.app);await pause(40);
    hydrate(browserClient,dehydrate(serverClient));const browser=sdkApp(browserClient);
    assert.equal(await renderToString(browser.app),html);assert.equal(html,'<p>false|0</p>');assert.equal(browser.calls(),0);
  }finally{serverClient.clear();browserClient.clear();}
});
function app(client:QueryClient,withRead:any,enabled=true,fail=false) {
  let calls=0;
  const App={setup(){
    const query=withRead((args:any)=>useQuery({queryKey:['zenstack','Product','findMany',args],enabled,retry:false,
      queryFn:async()=>{calls++;await pause(20);if(fail)throw Error('Fixture query failed');return [{name:'Asynchronous branch fixture'}];},
    }),'Product')({where:{companyId:'branch'}});
    return()=>Vue.h('p',query.error.value?'query-error':query.data.value?.[0]?.name || 'pending');
  }};
  const value=Vue.createSSRApp(App);value.use(VueQueryPlugin,{queryClient:client});return{value,calls:()=>calls};
}
test('company read adapters render the same async query snapshot they hydrate',async()=>{
  const withRead=adapter(),serverClient=new QueryClient({defaultOptions:{queries:{staleTime:300000}}});
  const server=app(serverClient,withRead);
  const browserClient=new QueryClient({defaultOptions:{queries:{staleTime:300000}}});
  try{
    const html=await renderToString(server.value);await pause(30);
    hydrate(browserClient,dehydrate(serverClient));
    const browser=app(browserClient,withRead);
    assert.equal(await renderToString(browser.value),html,'A query finishing after HTML generation must not produce different hydrated rows');
    assert.match(html,/Asynchronous branch fixture/);assert.equal(browser.calls(),0);
  }finally{serverClient.clear();browserClient.clear();}
});
test('disabled company queries never hold SSR open',async()=>{
  const client=new QueryClient(),fixture=app(client,adapter(),false);
  try{assert.equal(await Promise.race([renderToString(fixture.value),pause(150).then(()=>{throw Error('Disabled query hung SSR');})]),'<p>pending</p>');assert.equal(fixture.calls(),0);}
  finally{client.clear();}
});
test('failed company queries finish SSR with an error state',async()=>{
  const client=new QueryClient(),fixture=app(client,adapter(),true,true);
  try{const html=await renderToString(fixture.value);await pause(30);assert.equal(html,'<p>query-error</p>');}
  finally{client.clear();}
});
