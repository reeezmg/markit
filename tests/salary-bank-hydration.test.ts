import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';
test('salary payment bank options hydrate from the server snapshot',async()=>{
  const src=readFileSync(process.env.SALARY_BANKS_SOURCE||'composables/useSalaryPaymentAccounts.ts','utf8');
  const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const state=new Map();const useState=(key:string,init:any)=>{if(!state.has(key))state.set(key,Vue.ref(init()));return state.get(key);};
  const bindings={ref:Vue.ref,computed:Vue.computed,watch:Vue.watch,onMounted:Vue.onMounted,onServerPrefetch:Vue.onServerPrefetch,useState};
  const module={exports:{} as any};new Function('exports',...Object.keys(bindings),js)(module.exports,...Object.values(bindings));
  let requests=0;
  const scope={companyId:Vue.ref('head'),fetch:async()=>{requests++;return {banks:[{id:'fixture-bank',name:'Fixture bank'}],selectedBankId:null};}};
  let read:any;
  const component={setup(){read=module.exports.useSalaryPaymentAccounts(scope);return()=>Vue.h('select',read.banks.value.map((b:any)=>Vue.h('option',b.name)));}};
  const html=await renderToString(Vue.createSSRApp(component));
  await new Promise(done=>setTimeout(done,20));
  assert.equal(html,'<select><option>Fixture bank</option></select>','SSR waits for the bank options');
  // A hydration setup receives the serialized state, before any mounted refresh runs.
  let mounted:any;const clientBindings={...bindings,onMounted:(fn:any)=>{mounted=fn;},onServerPrefetch:()=>{}};
  const clientModule={exports:{} as any};new Function('exports',...Object.keys(clientBindings),js)(clientModule.exports,...Object.values(clientBindings));
  const client=Vue.effectScope();let hydrated:any;
  client.run(()=>{hydrated=clientModule.exports.useSalaryPaymentAccounts(scope);});
  assert.deepEqual(hydrated.banks.value,read.banks.value);
  assert.equal(requests,1,'Client setup does not erase the hydrated options or start a competing load');
  assert.equal(typeof mounted,'function');client.stop();
});
