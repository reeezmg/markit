import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {ref,computed,watch} from 'vue';
async function plugin(client:boolean,session:any,path:string,saved:string|null=null){
  const source=readFileSync(process.env.AUTH_PLUGIN_SOURCE||'auth/plugins/0.auth.ts','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm,'').replace('export default','return');
  const middleware=new Map<string,any>(),navigations:string[]=[];
  const bindings={defineNuxtPlugin:(fn:any)=>fn,useRuntimeConfig:()=>({}),useFetch:async()=>({data:ref(session),refresh:async()=>{}}),computed,ref,watch,
    useState:(_key:string,init:any)=>ref(init()),process:{client},addRouteMiddleware:(name:string,fn:any)=>middleware.set(name,fn),
    useRoute:()=>({path,fullPath:path,query:{},meta:{auth:true}}),navigateTo:async(target:string)=>{navigations.push(target);},
    localStorage:{getItem:()=>saved,setItem:()=>{}},
  };
  await new Function(...Object.keys(bindings),js)(...Object.values(bindings))({payload:{}});
  return{middleware,navigations};
}
for(const [session,path,expected] of [[{email:'fixture@example.invalid',plan:'pro'},'/offline','/erp/billing'],
  [{email:'fixture@example.invalid',plan:'lite'},'/erp/billing','/offline'],[{},'/products','/login']] as const){
  test(`server navigation guards ${path} before rendering`,async()=>{
    const current=await plugin(false,session,path),guard=current.middleware.get('auth');assert.equal(typeof guard,'function');
    assert.equal(guard({path,meta:{auth:true}}),expected);assert.equal(current.middleware.has('persist-last-route'),false);
  });
}
test('an explicit seller deep link takes priority over the previously saved route',async()=>{
  const current=await plugin(true,{email:'fixture@example.invalid',plan:'pro'},'/products/brands','/products/edit/old');
  assert.deepEqual(current.navigations,[]);
});
