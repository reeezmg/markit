import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accountantContext} from '../server/utils/accountant/context';
import {ecommerceAccountingRouter,ecommerceRoles} from '../server/utils/accountant/ecommerce';
import {investorProfitRouter} from '../server/utils/accountant/investor-profits';
const accounts=Object.entries(ecommerceRoles).map(([role,spec])=>({id:'selected-'+role,companyId:'a',accountType:spec.type,isActive:true,deletedAt:null,isPrimary:role==='bank',isSystem:true,code:'code-'+role}));
const mappings=Object.fromEntries(Object.entries(ecommerceRoles).map(([role])=>[role,'selected-'+role]));
let saved:any={...mappings},enabled=false,writes=0;
const match=(a:any,w:any)=>Object.entries(w).every(([key,v]:any)=>key==='OR'?v.some((p:any)=>match(a,p)):v?.in?v.in.includes(a[key]):a[key]===v);
const db:any={accountantAccountingAccount:{createMany:async()=>({count:0}),findFirst:async({where}:any)=>accounts.find(a=>match(a,where)),findMany:async({where}:any)=>accounts.filter(a=>match(a,where))},
 $queryRawUnsafe:async(sql:string)=>sql.includes('accountant_v2_ecommerce_settings')?[{accounts:saved,enabled}]:sql.includes('accountant_v2_erp_settings')?[{accounts:mappings}]:[],
 $executeRawUnsafe:async(sql:string,_company:string,value:string)=>{assert.ok(sql.startsWith('INSERT INTO accountant_v2_ecommerce_settings'));saved=JSON.parse(value);writes++;return 1;}};
async function call(router:any,method:string,path:string,body:any={},companyId='a',role='manager'){return accountantContext.run({companyId,userId:'tester',role,db},async()=>{let result:any;await router.dispatch(method,path,{user:{companyId,userId:'tester',role},body,params:{},query:{}},{json:(v:any)=>result=v,status:()=>{}});return result;});}
await call(ecommerceAccountingRouter,'PUT','/settings',{mappings});assert.deepEqual(saved,mappings);assert.equal(enabled,false,'Saving selections must not activate/import');
let rejected=0;
for(const role of Object.keys(ecommerceRoles)){
 await assert.rejects(call(ecommerceAccountingRouter,'PUT','/settings',{mappings:{...mappings,[role]:'missing'}}));rejected++;
 const a=accounts.find(a=>a.id===mappings[role])!;a.isActive=false;await assert.rejects(call(ecommerceAccountingRouter,'PUT','/settings',{mappings}));a.isActive=true;rejected++;
  const wrong=accounts.find(a=>a.accountType!==ecommerceRoles[role].type)!;
  await assert.rejects(call(ecommerceAccountingRouter,'PUT','/settings',{mappings:{...mappings,[role]:wrong.id}}));rejected++;
}
await assert.rejects(call(ecommerceAccountingRouter,'PUT','/settings',{mappings},'b'));rejected++;
await assert.rejects(call(ecommerceAccountingRouter,'PUT','/settings',{mappings:{...mappings,deliveryIncome:mappings.sales}}));rejected++;
assert.equal(writes,1,'Invalid selections must not save');
await assert.rejects(call(investorProfitRouter,'PUT','/settings',{accountId:'equity'},'a','accountant'),/manager or admin/);
const settingsPage=fs.readFileSync('pages/settings/account.vue','utf8');
assert.ok(settingsPage.includes('v-if="canManageProfit"'));
assert.ok(settingsPage.includes('if (!canManageProfit.value) return'));
assert.ok(settingsPage.includes("['admin', 'manager'].includes"));
const result={at:new Date().toISOString(),method:'Actual ecommerce settings and profit settings routers with request context and mocked database; no real database calls.',onlineRoles:Object.keys(ecommerceRoles).length,selectedMappingsSaved:true,saveDoesNotActivate:true,invalidSelectionsRejected:rejected,accountantCannotSaveProfitDistribution:true,profitSaveVisibleToAccountant:false};
fs.writeFileSync(`${process.env.ACCOUNTING_REVIEW_DIR||'scripts/production-accounting/runs/account-settings-review-2026-10-06'}/online-permissions.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
