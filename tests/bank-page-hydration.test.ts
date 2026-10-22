import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import {parse,compileScript} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';
import {QueryClient,VueQueryPlugin,useQuery,dehydrate,hydrate} from '@tanstack/vue-query';

function page(client:QueryClient){
  const descriptor=parse(readFileSync(process.env.BANK_PAGE_SOURCE||'pages/accounts/bank/index.vue','utf8'),{filename:'bank.vue'}).descriptor;
  const script=compileScript(descriptor,{id:'bank-fixture'}).content;
  const js=ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let fetches=0;
  const query=(model:string,value:any)=>useQuery({queryKey:['bank-fixture',model,'branch'],staleTime:300000,retry:false,
    queryFn:async()=>{fetches++;await new Promise(done=>setTimeout(done,25));return value;}});
  const company={useFindUniqueCompany:()=>query('Company',{bankName:'Fixture primary bank'})};
  const banks={useFindManyBankAccount:()=>query('BankAccount',[])};
  const bindings={onServerPrefetch:Vue.onServerPrefetch,unref:Vue.unref,useCompanyScope:()=>({auth:{session:Vue.ref({companyId:'branch'})},fetch:()=>{}}),navigateTo:()=>{}};
  const require=createRequire(import.meta.url),module={exports:{} as any};
  new Function('require','exports','module',...Object.keys(bindings),js)(
    (name:string)=>name==='vue'?Vue:name==='~/lib/hooks/company'?company:name==='~/lib/hooks/bank-account'?banks:require(name),module.exports,module,...Object.values(bindings));
  const component=module.exports.default;
  component.render=function(this:any){return Vue.h('p',this.$.setupState.rows[0].bankName);};
  const app=Vue.createSSRApp(component);app.use(VueQueryPlugin,{queryClient:client});return{app,fetches:()=>fetches};
}
test('legacy bank rows hydrate the same company/bank snapshot rendered on the server',async()=>{
  const serverClient=new QueryClient(),browserClient=new QueryClient();
  try{
    const server=page(serverClient),html=await renderToString(server.app);
    await new Promise(done=>setTimeout(done,40));hydrate(browserClient,dehydrate(serverClient));
    const browser=page(browserClient);assert.equal(await renderToString(browser.app),html);
    assert.equal(html,'<p>Fixture primary bank</p>');assert.equal(browser.fetches(),0);
  }finally{serverClient.clear();browserClient.clear();}
});
