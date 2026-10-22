import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {createSSRApp,h,ref,onServerPrefetch} from 'vue';
import {renderToString} from '@vue/server-renderer';
import {QueryClient,VueQueryPlugin,dehydrate,hydrate,useQuery} from '@tanstack/vue-query';
import {serialize,deserialize} from '@zenstackhq/runtime/browser';
function setup(server:boolean,payload:any=null){
 const state=ref(payload),hooks=new Map<string,Function>();let client!:QueryClient;
 const app=createSSRApp({setup(){const q=useQuery({queryKey:['failure','branch'],retry:false,queryFn:async()=>{throw Error('private SQL marker');}});if(server)onServerPrefetch(()=>q.suspense().catch(()=>{}));return()=>h('p',q.isLoading.value?'loading':q.isError.value?'error':'ready');}});
 const src=ts.transpileModule(readFileSync(process.env.VUE_QUERY_PLUGIN_SOURCE||'plugins/vue-query.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*?;\r?\n/gm,'').replace('export default','return').replaceAll('import.meta.server',String(server)).replaceAll('import.meta.client',String(!server));
 class Client extends QueryClient{constructor(...args:any[]){super(...args);client=this;}}
 const fn=new Function('VueQueryPlugin','QueryClient','dehydrate','hydrate','defineNuxtPlugin','useState','serialize','deserialize','onNuxtReady',src)(VueQueryPlugin,Client,dehydrate,hydrate,(f:any)=>f,()=>state,serialize,deserialize,(fn:Function)=>hooks.set('app:suspense:resolve',fn));
 fn({vueApp:app,hooks:{hook:(name:string,f:Function)=>hooks.set(name,f)}});return{app,client,state,hooks};
}
test('failed server queries retain the rendered error state during hydration',async()=>{
 const server=setup(true);let browser:any;
 try{
  const html=await renderToString(server.app);await server.hooks.get('app:rendered')!();
  assert.ok(!JSON.stringify(server.state.value).includes('private SQL marker'),'Server error details are not exported');
  browser=setup(false,JSON.parse(JSON.stringify(server.state.value)));
  // Nuxt's root can mount while an asynchronous route is still hydrating.
  await browser.hooks.get('app:mounted')?.();
  assert.equal(browser.client.getDefaultOptions().queries?.retryOnMount,false,'Root mount must not restart failed queries before page hydration');
  assert.equal(html,'<p>error</p>');assert.equal(await renderToString(browser.app),html);
  assert.equal(browser.client.getDefaultOptions().queries?.retryOnMount,false);
  await browser.hooks.get('app:suspense:resolve')!();
  assert.equal(browser.client.getDefaultOptions().queries?.retryOnMount,true,'Normal retries return after initial hydration');
 }finally{server.client.clear();browser?.client.clear();}
});
