import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accountantContext} from '../server/utils/accountant/context';
import {moneyRouter} from '../server/utils/accountant/money';
const accounts:any[]=[{id:'cash',companyId:'a',accountType:'CASH',isActive:true,deletedAt:null},{id:'bank',companyId:'a',accountType:'BANK',isActive:true,deletedAt:null},{id:'foreign',companyId:'b',accountType:'CASH',isActive:true,deletedAt:null}];
const journals:any[]=[],audits:any[]=[];
const people=['client','user','distributor','contact'].map(kind=>({kind,id:`${kind}-1`,name:`${kind} name`}));
const matches=(row:any,where:any):boolean=>Object.entries(where).every(([key,value]:any)=>key==='OR'?value.some((v:any)=>matches(row,v)):key==='AND'?value.every((v:any)=>matches(row,v)):value?.in?value.in.includes(row[key]):row[key]===value);
let creations=0;
const db:any={
  accountantAccountingAccount:{
    findMany:async({where}:any)=>accounts.filter(a=>matches(a,where)),
    findFirst:async({where}:any)=>accounts.find(a=>matches(a,where)),
    count:async({where}:any)=>accounts.filter(a=>matches(a,where)).length,
    create:async({data}:any)=>{creations++;const row={id:'clearing',isActive:true,deletedAt:null,...data};accounts.push(row);return row;},
  },
  accountantAudit:{findMany:async({where}:any)=>audits.filter(a=>matches(a,where)),findFirst:async({where}:any)=>audits.find(a=>matches(a,where)),create:async({data}:any)=>{const row={deletedAt:null,...data};audits.push(row);return row;}},
  accountantTransactionLock:{findFirst:async()=>null},
  accountantContact:{count:async({where}:any)=>[{id:'contact-1',companyId:'a',deletedAt:null}].filter(p=>matches(p,where)).length},
  accountantPreference:{findUnique:async()=>null},company:{findUnique:async()=>({currency:'INR'})},
  accountantManualJournal:{
    count:async()=>journals.length,
    findFirst:async({where}:any)=>journals.find(j=>matches(j,where)),
    create:async({data}:any)=>{const row={id:`j${journals.length}`,deletedAt:null,reversals:[],...data,lines:data.lines.create};journals.push(row);return row;},
  },
  $queryRawUnsafe:async(sql:string,company:string)=>{assert.ok(sql.includes('company_users'));return company==='a'?people:[];},
};
async function call(method:string,path:string,body:any){let result:any;const res:any={json:(r:any)=>{result=r;return res;},status:()=>res};await accountantContext.run({companyId:'a',userId:'tester',role:'manager',db},()=>moneyRouter.dispatch(method,path,{user:{companyId:'a',userId:'tester',role:'manager'},body,query:{},params:{}},res));return result;}
const input=(kind='user',direction='RECEIVE')=>({requestId:randomUUID(),direction,date:'2026-10-06',moneyAccountId:'cash',amount:100,reference:'Reference only',note:'',party:{kind,id:`${kind}-1`}});
await assert.rejects(call('POST','/',{...input(),party:null}));
await assert.rejects(call('POST','/',{...input(),party:{kind:'user',id:'foreign-person'}}));
await assert.rejects(call('POST','/',{...input(),moneyAccountId:'foreign'}));
assert.equal(creations,0,'Invalid links and foreign accounts must not create clearing records');
for(const kind of ['client','user','distributor','contact'])for(const direction of ['RECEIVE','PAY']){
  const payload=input(kind,direction),row=await call('POST','/',payload);
  assert.equal(row.lines.length,2);assert.equal(row.lines[0].accountId,'cash');assert.equal(row.lines[1].accountId,'clearing');
  assert.equal(row.lines[0].side,direction==='RECEIVE'?'DEBIT':'CREDIT');assert.notEqual(row.lines[0].side,row.lines[1].side);
  assert.equal(row.referenceNumber,'Reference only');
  for(const line of row.lines){assert.equal(line.amount,100);assert.equal(line.companyId,'a');if(kind==='distributor')assert.equal(line.distributorId,'distributor-1');else if(kind==='contact')assert.equal(line.partyId,'contact-1');else assert.deepEqual(line.sourceParties,{[kind]:{id:`${kind}-1`,name:`${kind} name`}});}
  assert.equal((await call('POST','/',payload)).id,row.id,'Identical retry must reuse journal');
  await assert.rejects(call('POST','/',{...payload,reference:'Changed reference'}),/already used/);
}
assert.equal(creations,1,'A single company clearing account is shared');
assert.equal(accounts.find(a=>a.id==='clearing').name,'Receive / Pay clearing');
assert.equal(journals.length,8,'Retries must not post extra rows');
const original=journals[0],reversal=await call('POST',`/${original.id}/reverse`,{date:'2026-10-06'});
for(let i=0;i<2;i++){assert.equal(reversal.lines[i].accountId,original.lines[i].accountId);assert.notEqual(reversal.lines[i].side,original.lines[i].side);assert.deepEqual(reversal.lines[i].sourceParties,original.lines[i].sourceParties);}
accounts.find(a=>a.id==='clearing').isActive=false;
await assert.rejects(call('POST','/',input()),/clearing account must be active/);
console.log('Linked-person money entries passed: balanced Receive/Pay, all person types, references, shared clearing, tenant checks, retries and reversal attribution.');
