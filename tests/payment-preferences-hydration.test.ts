import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import {parse,compileScript} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';
import {QueryClient,VueQueryPlugin,useQuery,dehydrate,hydrate} from '@tanstack/vue-query';

function payment(server:boolean,client:QueryClient){
  const source=readFileSync(process.env.PAYMENT_PAGE_SOURCE || 'pages/ecommerce-cms/payment.vue','utf8');
  const descriptor=parse(source,{filename:'payment.vue'}).descriptor;
  const script=compileScript(descriptor,{id:'payment-fixture'}).content;
  const js=ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
    .replaceAll('import.meta.server',String(server)).replaceAll('import.meta.client',String(!server));
  let fetches=0;
  const hooks={useFindFirstGeneralPreference:()=>useQuery({queryKey:['payment-preference','branch'],staleTime:300000,retry:false,
    queryFn:async()=>{fetches++;await new Promise(done=>setTimeout(done,25));return {value:{gateway:'cashfree',enabled:true,cashfree:{appId:'fixture-id',secretKey:'fixture-secret',environment:'TEST'}}};},
  }),useUpsertGeneralPreference:()=>({mutateAsync:async()=>{throw Error('No preference writes in hydration test');}})};
  const bindings={ref:Vue.ref,computed:Vue.computed,watch:Vue.watch,onServerPrefetch:Vue.onServerPrefetch,
    definePageMeta:()=>{},useNuxtApp:()=>({$auth:{session:Vue.ref({companyId:'branch'})}}),useToast:()=>({add(){}}),
    useRequestURL:()=>new URL('https://fixture.test'),$fetch:async()=>{throw Error('No external requests in hydration test');},
  };
  const require=createRequire(import.meta.url),module={exports:{} as any};
  new Function('require','exports','module',...Object.keys(bindings),js)(
    (name:string)=>name==='vue'?Vue:name==='~/lib/hooks/general-preference'?hooks:require(name),module.exports,module,...Object.values(bindings));
  const component=module.exports.default;
  component.render=function(this:any){const config=this.$.setupState.config;return Vue.h('p',config.gateway+'|'+config.enabled);};
  const app=Vue.createSSRApp(component);app.use(VueQueryPlugin,{queryClient:client});return {app,fetches:()=>fetches};
}
test('payment preferences initialize before SSR and hydration render the gateway state',async()=>{
  const serverClient=new QueryClient(),browserClient=new QueryClient();
  try{
    const server=payment(true,serverClient),html=await renderToString(server.app);
    await new Promise(done=>setTimeout(done,40));hydrate(browserClient,dehydrate(serverClient));
    const browser=payment(false,browserClient);
    assert.equal(await renderToString(browser.app),html,'Saved gateway state must match the rendered SSR form');
    assert.equal(html,'<p>cashfree|true</p>');assert.equal(browser.fetches(),0);
  }finally{serverClient.clear();browserClient.clear();}
});
