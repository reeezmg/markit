import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createInvestorFlowFixture } from './investor-flow-fixture';
const input = (extra:any={}) => ({requestId:randomUUID(),name:'Ravi',effectiveDate:'2026-01-01',newUser:{name:'Ravi',email:`${randomUUID()}@example.test`},...extra});

test('percentage profile -> capital received/returned -> real profit allocation -> partial/full payout',async()=>{
 const f=createInvestorFlowFixture();await f.call('/investors/share-settings','PUT',{includeShares:false,totalShares:1000});
 const payload=input({ownershipPercent:25,profitPercent:25}),p=await f.call('/investors','POST',payload);
 assert.equal(f.state.terms.length,1);assert.equal(f.state.journals.length,3,'Profile creates no journal');
 await f.call('/investors','POST',payload);assert.equal(f.state.investors.length,1);
 await assert.rejects(f.call('/investors','POST',{...payload,name:'Changed'}),/different investor/);
 const move=(kind:string,amount:number,date='2026-01-10')=>f.call(`/investors/${p.id}/events`,'POST',{requestId:randomUUID(),kind,amount,date,counterAccountId:'bank'});
 await move('CAPITAL_IN',20000);await move('CAPITAL_OUT',5000);
 const period={periodFrom:'2026-01-01',periodTo:'2026-01-31',distributable:10000};
 const preview=await f.call('/investor-profits/preview','POST',period);assert.equal(preview.total,2500);assert.equal(preview.profit,12000);
 const approval={...period,requestId:randomUUID(),previewHash:preview.previewHash,date:'2026-01-31'};
 await f.call('/investor-profits/approve','POST',approval);await f.call('/investor-profits/approve','POST',approval);
 await assert.rejects(move('PROFIT_PAY',2500.01,'2026-02-01'),/exceeds/);
 await move('PROFIT_PAY',1000,'2026-02-01');await move('PROFIT_PAY',1500,'2026-02-02');
 const s=(await f.call('/investors')).data[0];assert.equal(s.capital,15000);assert.equal(s.paid,2500);assert.equal(s.payable,0);
 await assert.rejects(f.call(`/investors/${p.id}`,'PUT',{name:'Ravi',ownershipPercent:25,profitPercent:30,effectiveDate:'2026-01-31'}),/already used/);
 for(const j of f.state.journals){const sum=(side:string)=>j.lines.filter((l:any)=>l.side===side).reduce((n:number,l:any)=>n+Math.round(l.amount*100),0);assert.equal(sum('DEBIT'),sum('CREDIT'));}
});
test('profile percentages validate company totals, creation rolls back identity and audit, tenant and role checks',async()=>{
 const f=createInvestorFlowFixture();await f.call('/investors/share-settings','PUT',{includeShares:false,totalShares:1000});
 await f.call('/investors','POST',input({ownershipPercent:25,profitPercent:25}));const before=structuredClone(f.state);
 await assert.rejects(f.call('/investors','POST',input({ownershipPercent:80,profitPercent:80})),/exceeds 100/);assert.deepEqual(f.state,before);
 const p=await f.call('/investors','POST',input({ownershipPercent:10,profitPercent:10}));
 await assert.rejects(f.call(`/investors/${p.id}`,'GET',{}, {},'b'),/not found/);
 await assert.rejects(f.call('/investors','POST',input({ownershipPercent:1,profitPercent:1}),{},'a','accountant'),/managers and admins/);
 await assert.rejects(f.call('/investors','GET',{}, {},'a','user'),/Accountant access/);
});
test('agreement mutations are retired, reads stay read-only, and profile edits without participation preserve mappings',async()=>{
 const f=createInvestorFlowFixture(),p=await f.call('/investors','POST',input());
 const before=structuredClone(f.state);await f.call('/investors/options');await f.call('/investors/users');await f.call('/investors/share-settings');assert.deepEqual(f.state,before);
 await assert.rejects(f.call('/investors','POST',input({initialAgreement:{}})),/removed/);
 await assert.rejects(f.call(`/investors/${p.id}/terms`,'POST',{}),/removed/);
 await assert.rejects(f.call(`/investors/${p.id}/terms/old`,'PUT',{}),/removed/);
 await assert.rejects(f.call(`/investors/${p.id}/terms/old`,'DELETE'),/removed/);
 await f.call(`/investors/${p.id}`,'PUT',{name:'Renamed'});assert.deepEqual(f.state.investors[0].accounts,before.investors[0].accounts);
});
