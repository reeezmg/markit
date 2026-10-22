import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import {parse,compileScript} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {renderToString} from '@vue/server-renderer';
import {QueryClient,VueQueryPlugin} from '@tanstack/vue-query';

test('sales list hydrate the rendered rows and report totals without a competing setup fetch',async()=>{
 const state=new Map<string,any>();
 function page(){
  const source=readFileSync(process.env.SALES_PAGE_SOURCE||'pages/erp/sales.vue','utf8');
  const descriptor=parse(source,{filename:'sales.vue'}).descriptor;
  const script=compileScript(descriptor,{id:'sales-list-fixture'}).content;
  const js=ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let fetches=0;
  const fetch=async(path:string)=>{fetches++;await new Promise(done=>setTimeout(done,20));return path.includes('findManyBills')?{rows:[{id:'fixture-sale'}],total:1,totals:{total:120,cash:120,card:0,upi:0,credit:0},collections:{creditRepayments:15}}:{totalSales:120,totalCommission:10,billCount:1};};
  const scope={ready:Promise.resolve(),readIds:Vue.ref(['branch']),auth:{session:Vue.ref({companyId:'branch'})},fetch};
  const bindings={ref:Vue.ref,computed:Vue.computed,watch:Vue.watch,onMounted:Vue.onMounted,
   useCompanyScope:()=>scope,useBillStore:()=>Vue.reactive({lastUpdate:0}),useSalesTableStore:()=>({$patch(){}}),
   useToast:()=>({add(){}}),useRouter:()=>({}),useOrganizationActions:()=>({forOwner(){}}),usePrint:()=>({printBill(){}}),
   useAsyncData:async(key:string,fn:any)=>{if(!state.has(key))state.set(key,JSON.parse(JSON.stringify(await fn())));return{data:Vue.ref(state.get(key))};},
  };
  const require=createRequire(import.meta.url),module={exports:{} as any};
  new Function('require','exports','module',...Object.keys(bindings),js)((name:string)=>name==='vue'?Vue:require(name),module.exports,module,...Object.values(bindings));
  const component=module.exports.default;
  component.render=function(this:any){const s=this.$.setupState;return Vue.h('p',[s.isLoading,s.sales.length,s.pageTotal,s.salesTotals.total,s.collectionsTotal].join('|'));};
  const app=Vue.createSSRApp(component);app.use(VueQueryPlugin,{queryClient:new QueryClient()});return{app,fetches:()=>fetches};
 }
 const server=page(),html=await renderToString(server.app);
 assert.equal(html,'<p>false|1|1|120|15</p>','Initial server rendering waits for both sales and report totals');
 const browser=page();assert.equal(await renderToString(browser.app),html);
 assert.equal(server.fetches(),1);assert.equal(browser.fetches(),0);
});
