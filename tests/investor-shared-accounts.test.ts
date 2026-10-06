import assert from 'node:assert/strict';
import { accountantContext } from '../server/utils/accountant/context';
import { resolveInvestorAccountSelections, writeInvestorJournal, investorRouter, investorEvents, investorTotals, addInvestorEvent } from '../server/utils/accountant/investors';

const accounts = [
  ['equity', 'EQUITY', 'EQUITY'], ['override', 'EQUITY', 'EQUITY'],
  ['profit', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'], ['loan', 'LIABILITY', 'OTHER_LIABILITY'],
  ['cash', 'ASSET', 'CASH'],
].map(([id, category, accountType]) => ({ id, category, accountType, companyId: 'a', isActive: true, deletedAt: null }));
accounts.push({ ...accounts[0], id: 'foreign', companyId: 'b' }, { ...accounts[0], id: 'inactive', isActive: false }, { ...accounts[0], id: 'deleted', deletedAt: new Date() as any });
const matches = (row:any, where:any) => Object.entries(where).every(([k,v]:any) => v?.in ? v.in.includes(row[k]) : row[k] === v);
let defaults:any = { capitalAccountId:'equity', profitAccountId:'profit', loanAccountId:'loan' };
const audits:any[] = [], journals:any[] = [], events:any[] = [];
const profiles:any[] = ['i1','i2'].map(id => ({ id, company_id:'a', name:id, legacy_user_id:`u-${id}`, profile:{status:'ACTIVE'}, accounts:{capital:'equity',profit:'profit',loan:'loan'} }));
const db:any = {
  accountantAccountingAccount: {
    findFirst:async ({where}:any)=>accounts.find(a=>matches(a,where)),
    count:async ({where}:any)=>accounts.filter(a=>matches(a,where)).length,
  },
  accountantAudit: {
    findMany:async ()=>[{resourceId:'investments',after:defaults}],
    create:async ({data}:any)=>{audits.push(data);return data;},
  },
  accountantTransactionLock:{findFirst:async()=>null},
  company:{findUnique:async()=>({currency:'INR'})},
  accountantPreference:{findUnique:async()=>null},
  accountantManualJournal:{count:async()=>journals.length,create:async({data}:any)=>{journals.push(data);return {id:`j${journals.length}`,...data};}},
  $queryRawUnsafe:async(sql:string,companyId:string,id:string)=>{
    assert.equal(companyId,'a');
    if(sql.includes('FROM accountant_v2_investor_events WHERE company_id=$1 AND request_id'))return [];
    if(sql.includes("accounts->>'capital'=$2"))return profiles.filter(p=>Object.values(p.accounts).includes(id));
    if(sql.includes('FROM accountant_v2_investors WHERE'))return structuredClone(profiles.filter(p=>p.id===id&&p.company_id===companyId));
    if(sql.includes('FROM accountant_v2_investor_events e')){
      assert.ok(sql.includes('AND e.investor_id=$2'));
      return events.filter(e=>e.investor_id===id);
    }
    throw Error('Unexpected SQL: '+sql);
  },
  $executeRawUnsafe:async(sql:string,companyId:string,id:string,name:string,profile:string,userId:string,selected:string)=>{
    assert.ok(sql.startsWith('UPDATE accountant_v2_investors SET'));
    assert.equal(companyId,'a');
    const p=profiles.find(p=>p.id===id);
    Object.assign(p,{name,profile:JSON.parse(profile),legacy_user_id:userId,accounts:JSON.parse(selected)});
    return 1;
  },
};
const run = (fn:()=>Promise<any>) => accountantContext.run({companyId:'a',userId:'tester',role:'manager',db},fn);
async function edit(id:string,body:any){
  let result:any;
  await run(()=>investorRouter.dispatch('PUT',`/${id}`,{user:{companyId:'a',userId:'tester',role:'manager'},body,params:{},query:{}},{json:(r:any)=>{result=r;},status:()=>{}} as any));
  return result;
}
await run(async()=>{
  assert.deepEqual(await resolveInvestorAccountSelections({}),{capital:'equity',profit:'profit',loan:'loan'});
  assert.equal((await resolveInvestorAccountSelections({capitalAccountId:'override'})).capital,'override');
  assert.equal((await resolveInvestorAccountSelections({capitalAccountId:''})).capital,'equity');
  assert.equal((await resolveInvestorAccountSelections({}, {capital:'override'})).capital,'override');
  for(const id of ['foreign','inactive','deleted','cash'])await assert.rejects(resolveInvestorAccountSelections({capitalAccountId:id}));
  defaults={};
  await assert.rejects(resolveInvestorAccountSelections({}),/company investment default/);
  assert.deepEqual(await resolveInvestorAccountSelections({capitalAccountId:'equity'}),{capital:'equity'});
  defaults={capitalAccountId:'equity',profitAccountId:'profit',loanAccountId:'loan'};
  for(const p of profiles)await writeInvestorJournal(p,`e-${p.id}`,new Date('2026-10-06'),100,[{accountId:'cash',side:'DEBIT',amount:100},{accountId:'equity',side:'CREDIT',amount:100}],'','');
  for(let i=0;i<2;i++)for(const line of journals[i].lines.create){
    assert.deepEqual(line.sourceParties,{investor:{id:profiles[i].id,name:profiles[i].name}});
    assert.equal(line.companyId,'a');
  }
  events.push({investor_id:'i1',kind:'CAPITAL_IN',amount:100,event_date:'2026-10-06',journal_status:'PUBLISHED',journal_deleted:null},{investor_id:'i2',kind:'CAPITAL_IN',amount:800,event_date:'2026-10-06',journal_status:'PUBLISHED',journal_deleted:null});
  assert.equal(investorTotals(await investorEvents('i1')).capital,100);
  assert.equal(investorTotals(await investorEvents('i2')).capital,800);
  events.push({investor_id:'i2',kind:'PROFIT_ALLOCATE',amount:500,event_date:'2026-10-06',journal_status:'PUBLISHED',journal_deleted:null},{investor_id:'i2',kind:'LOAN_IN',amount:500,event_date:'2026-10-06',journal_status:'PUBLISHED',journal_deleted:null});
  const request={requestId:'00000000-0000-4000-8000-000000000001',date:'2026-10-06',amount:10,counterAccountId:'cash'};
  await assert.rejects(addInvestorEvent('i1',{...request,kind:'PROFIT_PAY'}),/exceeds allocated unpaid profit/);
  await assert.rejects(addInvestorEvent('i1',{...request,kind:'LOAN_OUT'}),/exceeds the loan balance/);
  assert.equal(journals.length,2,'Another investor balance cannot authorize a posting');
});
await assert.rejects(edit('i1',{name:'Investor 1',capitalAccountId:'override'}),/outstanding investor balance/);
assert.equal(profiles[0].accounts.capital,'equity');
assert.equal(audits.length,0);
await edit('i1',{name:'Renamed investor'});
assert.deepEqual(profiles[0].accounts,{capital:'equity',profit:'profit',loan:'loan'});
events.length=0;
await edit('i1',{name:'Investor 1',capitalAccountId:'override'});
assert.deepEqual(profiles[0].accounts,{capital:'override',profit:'profit',loan:'loan'});
await edit('i1',{name:'Investor 1',capitalAccountId:''});
assert.equal(profiles[0].accounts.capital,'equity');
assert.equal(profiles[1].accounts.capital,'equity');
assert.equal(audits.at(-1).after.accountSelections.before.capital,'override');
console.log('Shared investor accounts passed: defaults, overrides, tenant/type/status checks, journal attribution, isolated totals, balance guard and profile preservation.');
