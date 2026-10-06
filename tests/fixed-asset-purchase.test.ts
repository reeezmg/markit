import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accountantContext} from '../server/utils/accountant/context';
import {accountantManagementRouter} from '../server/utils/accountant/management';
const id=(letter:string)=>'c'+letter.repeat(24);
const categoryId=id('a'),vendorId=id('v');
const accounts:any[]=[['asset','ASSET','FIXED_ASSET'],['cash','ASSET','CASH'],['bank','ASSET','BANK'],['payable','LIABILITY','ACCOUNTS_PAYABLE']].map(([id,category,accountType])=>({id,category,accountType,companyId:'a',isActive:true,deletedAt:null}));
accounts.push({...accounts[0],id:'foreign',companyId:'b'},{...accounts[0],id:'inactive',isActive:false});
const assets:any[]=[],journals:any[]=[],audits:any[]=[];
const matches=(row:any,where:any)=>Object.entries(where).every(([key,value]:any)=>value?.in?value.in.includes(row[key]):row[key]===value);
let locked=false;
const db:any={
  accountantFixedAssetCategory:{findFirst:async({where}:any)=>matches({id:categoryId,companyId:'a',isActive:true,deletedAt:null,assetAccountId:'asset'},where)?{id:categoryId,assetAccountId:'asset'}:null},
  accountantFixedAsset:{count:async()=>assets.length,findFirst:async({where}:any)=>assets.find(a=>matches(a,where)),findMany:async()=>assets,create:async({data}:any)=>{const row={id:`fa${assets.length}`,deletedAt:null,...data};assets.push(row);return row;}},
  accountantAccountingAccount:{findFirst:async({where}:any)=>accounts.find(a=>matches(a,where)),count:async({where}:any)=>accounts.filter(a=>matches(a,where)).length},
  accountantContact:{findFirst:async({where}:any)=>matches({id:vendorId,companyId:'a',deletedAt:null},where)?{id:vendorId}:null,count:async({where}:any)=>[{id:vendorId,companyId:'a',deletedAt:null}].filter(v=>matches(v,where)).length},
  accountantTransactionLock:{findFirst:async()=>locked?{lockDate:new Date('2026-12-31'),reason:'Locked'}:null},
  accountantPreference:{findUnique:async()=>null},company:{findUnique:async()=>({currency:'INR'})},
  accountantAudit:{findFirst:async({where}:any)=>audits.find(a=>matches(a,where)),findMany:async({where}:any)=>audits.filter(a=>matches(a,where)),create:async({data}:any)=>{const row={deletedAt:null,...data};audits.push(row);return row;}},
  accountantManualJournal:{findFirst:async({where}:any)=>journals.find(j=>matches(j,where)),count:async()=>journals.length,create:async({data}:any)=>{const row={id:`j${journals.length}`,deletedAt:null,...data,lines:data.lines.create};journals.push(row);return row;}},
};
async function call(method:string,body:any){let result:any;const res:any={json:(r:any)=>{result=r;return res;},status:()=>res};await accountantContext.run({companyId:'a',userId:'tester',role:'manager',db},()=>accountantManagementRouter.dispatch(method,'/fixed-assets',{user:{companyId:'a',userId:'tester',role:'manager'},body,query:{},params:{}},res));return result;}
const input=()=>({categoryId,name:'Computer',purchaseDate:'2026-10-06',availableForUseDate:'2026-10-06',purchaseCost:40000,salvageValue:0,usefulLifeMonths:60,recordPayment:true,requestId:randomUUID(),paymentMethod:'CASH',paymentAccountId:'cash',paymentDate:'2026-10-06',paymentReference:'Invoice 123',vendorId});
for(const override of [{paymentAccountId:'foreign'},{paymentAccountId:'asset'},{paymentMethod:'UPI',paymentAccountId:'cash'},{paymentDate:'2026-10-05'},{paymentDate:'2026-10-07'},{vendorId:id('x')},{purchaseCost:40000.123}])await assert.rejects(call('POST',{...input(),...override}));
assert.equal(assets.length,0);assert.equal(journals.length,0);
locked=true;await assert.rejects(call('POST',input()),/locked/);locked=false;
assert.equal(assets.length,0,'Locked purchases must fail before asset creation');
for(const method of ['CASH','BANK','UPI','CARD','CHEQUE']){
  const body={...input(),paymentMethod:method,paymentAccountId:method==='CASH'?'cash':'bank'};
  const asset=await call('POST',body),j=journals.at(-1);
  assert.equal(j.sourceType,'ASSET_ACQUISITION');assert.equal(j.sourceId,asset.id);assert.equal(j.total,40000);
  assert.equal(j.lines[0].accountId,'asset');assert.equal(j.lines[0].side,'DEBIT');assert.equal(j.lines[1].accountId,body.paymentAccountId);assert.equal(j.lines[1].side,'CREDIT');
  for(const l of j.lines){assert.equal(l.amount,40000);assert.equal(l.partyId,vendorId);assert.deepEqual(l.sourceParties.asset,{id:asset.id,name:'Computer'});}
  const count=assets.length,posted=journals.length;
  assert.equal((await call('POST',body)).id,asset.id);assert.equal(assets.length,count);assert.equal(journals.length,posted);
  await assert.rejects(call('POST',{...body,purchaseCost:41000}),/different details/);
}
const before=journals.length;
const later=await call('POST',{...input(),paymentDate:'2026-10-08',purchasePayableAccountId:'payable'});
assert.equal(journals.length,before+2);
const acquisition=journals[before],payment=journals[before+1];
assert.equal(acquisition.journalDate.toISOString().slice(0,10),'2026-10-06');assert.equal(acquisition.lines[1].accountId,'payable');
assert.equal(payment.sourceType,'ASSET_PURCHASE_PAYMENT');assert.equal(payment.sourceId,later.id);assert.equal(payment.journalDate.toISOString().slice(0,10),'2026-10-08');
assert.equal(payment.lines[0].accountId,'payable');assert.equal(payment.lines[0].side,'DEBIT');assert.equal(payment.lines[1].accountId,'cash');
const registered=await call('POST',{...input(),recordPayment:false});
assert.equal(journals.length,before+2,'Register-only does not duplicate purchase accounting');
const listed=await call('GET',{});
assert.equal(listed.data.find((a:any)=>a.id===later.id).purchasePayment.status,'PAID');
assert.equal(listed.data.find((a:any)=>a.id===registered.id).purchasePayment,null);
console.log('Fixed asset purchases passed: payment types, balanced journals, delayed settlement, vendor/asset links, locks, company/type checks, retry safety and register-only preservation.');
