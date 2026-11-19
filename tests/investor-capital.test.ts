import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createInvestorFlowFixture } from './investor-flow-fixture';
import { calculateCapital } from '../server/utils/accountant/investor-capital';
async function person(f:ReturnType<typeof createInvestorFlowFixture>){return f.call('/investors','POST',{requestId:randomUUID(),name:'Share investor',effectiveDate:'2026-01-01',newUser:{name:'Share investor',email:`${randomUUID()}@example.test`}});}
const buy=(amount:number,pricePerShare:number,date='2026-01-02')=>({kind:'CAPITAL_IN',amount,pricePerShare,date,paymentStatus:'PAID'});
const redeem=(shareQuantity:number,pricePerShare:number,date='2026-01-03')=>({kind:'CAPITAL_OUT',shareQuantity,pricePerShare,date,paymentStatus:'PAID'});
async function trade(f:ReturnType<typeof createInvestorFlowFixture>,id:string,input:any){
 const preview=await f.call(`/investors/${id}/capital-preview`,'GET',{},input);
 const payload={...input,amount:preview.amount,requestId:randomUUID(),counterAccountId:'bank',previewHash:preview.previewHash};
 return {preview,payload,result:await f.call(`/investors/${id}/events`,'POST',payload)};
}
async function summary(f:ReturnType<typeof createInvestorFlowFixture>,id:string,asOf='2026-12-31'){return (await f.call('/investors','GET',{}, {asOf})).data.find((p:any)=>p.id===id);}

test('different purchase/redemption prices, share pool, percentages, journal cash and retry snapshots',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f);assert.equal((await summary(f,p.id)).shares,0);
 const first=await trade(f,p.id,buy(10000,100));await f.call(`/investors/${p.id}/events`,'POST',first.payload);assert.equal(f.state.events.length,2);
 await trade(f,p.id,buy(12000,120,'2026-01-02'));
 let s=await summary(f,p.id);assert.equal(s.shares,200);assert.equal(s.profitPercent,20);assert.equal(s.capital,22000);assert.equal(f.state.terms.length,2,'Same-day trades share one dated ownership snapshot');
 const sold=await trade(f,p.id,redeem(50,150));assert.equal(sold.preview.amount,7500);
 s=await summary(f,p.id);assert.equal(s.shares,150);assert.equal(s.profitPercent,15);assert.equal(s.capital,14500);
 const trades=f.state.events.filter((e:any)=>e.kind.startsWith('SHARE_'));assert.deepEqual(trades.map((e:any)=>e.details.pricePerShare),[100,120,150]);
 assert.equal(trades[2].details.capitalPreview.shareQuantity,50);
 assert.equal(s.capitalCommitment,undefined);assert.equal(s.capitalDue,undefined);
 const j=f.state.journals.find((j:any)=>j.id===sold.result.journalId);assert.equal(j.lines[0].amount,7500);
});
test('read-only preview, stale/missing hashes, missing prices, over-redemption, company pool and permissions',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),fields=buy(10000,100),before=structuredClone(f.state);
 const preview=await f.call(`/investors/${p.id}/capital-preview`,'GET',{},fields);assert.deepEqual(f.state,before);
 await trade(f,p.id,buy(100,100));
 await assert.rejects(f.call(`/investors/${p.id}/events`,'POST',{...fields,requestId:randomUUID(),counterAccountId:'bank',previewHash:preview.previewHash}),/changed/);
 await assert.rejects(f.call(`/investors/${p.id}/events`,'POST',{...fields,requestId:randomUUID(),counterAccountId:'bank'}),/Refresh/);
 await assert.rejects(trade(f,p.id,{kind:'CAPITAL_IN',date:'2026-01-02',amount:100}),/price per share/);
 await assert.rejects(trade(f,p.id,redeem(2,100)),/more shares/);
 await assert.rejects(trade(f,p.id,buy(100000,100)),/shares exceeded|exceed total/);
 await assert.rejects(f.call(`/investors/${p.id}/capital-preview`,'GET',{},fields,'a','accountant'),/managers and admins/);
 await assert.rejects(f.call(`/investors/${p.id}/capital-preview`,'GET',{},fields,'b'),/not found/);
 await assert.rejects(f.call('/investors/share-settings','PUT',{includeShares:true,totalShares:2000}),/fixed/);
 await f.call('/investors/share-settings','PUT',{includeShares:false,totalShares:1000});await assert.rejects(trade(f,p.id,buy(100,100)),/switched off/);
});
test('share reversal returns original cash and units, rejects dependent transactions and preserves historical holdings',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),first=await trade(f,p.id,buy(10000,100));
 const second=await trade(f,p.id,buy(12000,120,'2026-01-03'));
 await assert.rejects(f.call(`/investors/${p.id}/reverse/${first.result.id}`,'POST',{date:'2026-01-04',reason:'Undo'}),/dependent|capital payments/);
 await assert.rejects(trade(f,p.id,buy(100,100,'2026-01-02')),/Backdated/);
 await f.call(`/investors/${p.id}/reverse/${second.result.paymentId}`,'POST',{date:'2026-01-04',reason:'Undo cash'});
 await f.call(`/investors/${p.id}/reverse/${second.result.id}`,'POST',{date:'2026-01-04',reason:'Undo second purchase'});
 let s=await summary(f,p.id);assert.equal(s.shares,100);assert.equal(s.capital,10000);assert.equal((await summary(f,p.id,'2026-01-03')).shares,200);
 await f.call(`/investors/${p.id}/reverse/${first.result.paymentId}`,'POST',{date:'2026-01-05',reason:'Undo cash'});
 await f.call(`/investors/${p.id}/reverse/${first.result.id}`,'POST',{date:'2026-01-05',reason:'Undo first purchase'});
 s=await summary(f,p.id);assert.equal(s.shares,0);assert.equal(s.capital,0);
});
test('redemption reversal restores units at original payment price and allocation protects prior ownership',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f);await trade(f,p.id,buy(10000,100));
 const sale=await trade(f,p.id,redeem(50,150));await f.call(`/investors/${p.id}/reverse/${sale.result.paymentId}`,'POST',{date:'2026-01-04',reason:'Undo cash'});await f.call(`/investors/${p.id}/reverse/${sale.result.id}`,'POST',{date:'2026-01-04',reason:'Undo redemption'});
 assert.equal((await summary(f,p.id)).shares,100);assert.equal((await summary(f,p.id)).capital,10000);
 const period={periodFrom:'2026-01-05',periodTo:'2026-01-31',distributable:10000},preview=await f.call('/investor-profits/preview','POST',period);assert.equal(preview.total,1000);
 await f.call('/investor-profits/approve','POST',{...period,date:'2026-01-31',requestId:randomUUID(),previewHash:preview.previewHash});
 await assert.rejects(trade(f,p.id,buy(100,100,'2026-01-20')),/already used/);
 await trade(f,p.id,buy(1200,120,'2026-02-01'));assert.equal((await summary(f,p.id)).profitPercent,11);assert.equal((await summary(f,p.id)).allocated,1000);
});
test('locked trade rolls back cash, ownership and audit; fractional units and cash rounding reconcile',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),before=structuredClone(f.state);f.setLocked(true);
 await assert.rejects(trade(f,p.id,buy(10000,100)),/locked/);assert.deepEqual(f.state,before);f.setLocked(false);
 await trade(f,p.id,buy(1,3));assert.equal((await summary(f,p.id)).shares,0.33333333);
 const r=calculateCapital({shares:1},0,'CAPITAL_OUT',undefined,1000,123.456,0.5);assert.equal(r.amount,61.73);
 assert.throws(()=>calculateCapital(null,0,'CAPITAL_IN',0.01,1000,100000000000),/eight decimal/);
 await assert.rejects(trade(f,p.id,{...redeem(0.1,100),amount:9}),/must match/);
});
test('legacy ownership is retained as opening shares, and old commitment price never controls a new trade',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f);f.state.terms[0].terms={shares:100,totalShares:1000,ownershipPercent:10,profitPercent:7,capitalCommitment:100000,sharePrice:'1000',note:'Historical terms'};
 const old=structuredClone(f.state.terms[0]);await trade(f,p.id,buy(12000,120));
 assert.deepEqual(f.state.terms[0],old);const s=await summary(f,p.id);assert.equal(s.shares,200);assert.equal(s.profitPercent,20);assert.equal(s.capitalCommitment,undefined);
});
