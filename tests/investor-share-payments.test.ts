import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {shareDues} from '../server/utils/accountant/investor-share-dues';
import {createInvestorFlowFixture} from './investor-flow-fixture';
async function person(f:ReturnType<typeof createInvestorFlowFixture>){return f.call('/investors','POST',{requestId:randomUUID(),name:'Dues investor',effectiveDate:'2026-01-01',newUser:{name:'Dues investor',email:`${randomUUID()}@example.test`}});}
const purchase=(extra:any={})=>({date:'2026-01-02',kind:'CAPITAL_IN',amount:10000,pricePerShare:100,paymentStatus:'DUE',...extra});
async function post(f:ReturnType<typeof createInvestorFlowFixture>,id:string,input:any,role='manager'){
 const preview=await f.call(`/investors/${id}/capital-preview`,'GET',{},input,'a',role);
 const payload={...input,amount:preview.amount,requestId:randomUUID(),counterAccountId:'bank',previewHash:preview.previewHash};
 return {preview,payload,result:await f.call(`/investors/${id}/events`,'POST',payload,{},'a',role)};
}
const settle=(id:string,amount:number,date='2026-01-03',kind='CAPITAL_IN')=>({settleTradeId:id,kind,amount,date});
const summary=async(f:ReturnType<typeof createInvestorFlowFixture>,id:string,asOf='2026-12-31')=>(await f.call('/investors','GET',{}, {asOf})).data.find((p:any)=>p.id===id);

test('unpaid purchase moves shares, creates due without a journal, and later partial/full settlements never add shares again',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),journals=f.state.journals.length;
 const trade=await post(f,p.id,purchase());let s=await summary(f,p.id);
 assert.equal(s.shares,100);assert.equal(s.capital,0);assert.equal(s.shareCapitalDue,10000);assert.equal(f.state.journals.length,journals);assert.equal(trade.preview.after.capital,0);
 await f.call(`/investors/${p.id}/events`,'POST',trade.payload);assert.equal(f.state.events.length,1);
 const first=await post(f,p.id,settle(trade.result.id,4000));await f.call(`/investors/${p.id}/events`,'POST',first.payload);
 s=await summary(f,p.id);assert.equal(s.shares,100);assert.equal(s.capital,4000);assert.equal(s.shareCapitalDue,6000);assert.equal(f.state.terms.length,2);
 await post(f,p.id,settle(trade.result.id,6000,'2026-01-04'),'accountant');
 s=await summary(f,p.id);assert.equal(s.capital,10000);assert.equal(s.shares,100);assert.equal(s.shareCapitalDue,0);
 const dues=await f.call(`/investors/${p.id}/share-dues`);assert.equal(dues.trades[0].status,'PAID');assert.equal(dues.trades[0].paid,10000);
 assert.equal((await summary(f,p.id,'2026-01-02')).shareCapitalDue,10000);assert.equal((await summary(f,p.id,'2026-01-03')).shareCapitalDue,6000);
});
test('partially paid purchase posts only the confirmed amount and paid-in-full transactions settle immediately',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f);
 await post(f,p.id,purchase({paymentStatus:'PARTIAL',paidAmount:2500}));let s=await summary(f,p.id);assert.equal(s.shares,100);assert.equal(s.capital,2500);assert.equal(s.shareCapitalDue,7500);
 await post(f,p.id,purchase({date:'2026-01-03',amount:12000,pricePerShare:120,paymentStatus:'PAID'}));
 s=await summary(f,p.id);assert.equal(s.shares,200);assert.equal(s.capital,14500);assert.equal(s.shareCapitalDue,7500);
 const kinds=f.state.events.map((e:any)=>e.kind);assert.deepEqual(kinds,['SHARE_BUY','CAPITAL_IN','SHARE_BUY','CAPITAL_IN']);
 assert.equal(f.state.events.filter((e:any)=>e.kind==='CAPITAL_IN').every((e:any)=>!!e.details.settleTradeId),true);
});
test('unpaid redemption reduces shares, leaves cash untouched and creates a separate payable until settled',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f);await post(f,p.id,purchase({paymentStatus:'PAID'}));
 const redemption=await post(f,p.id,{date:'2026-01-03',kind:'CAPITAL_OUT',shareQuantity:20,pricePerShare:150,paymentStatus:'DUE'});
 let s=await summary(f,p.id);assert.equal(s.shares,80);assert.equal(s.capital,10000);assert.equal(s.shareRedemptionDue,3000);assert.equal(s.shareCapitalDue,0);
 await post(f,p.id,settle(redemption.result.id,500,'2026-01-04','CAPITAL_OUT'));s=await summary(f,p.id);assert.equal(s.shares,80);assert.equal(s.capital,9500);assert.equal(s.shareRedemptionDue,2500);
 await post(f,p.id,settle(redemption.result.id,2500,'2026-01-05','CAPITAL_OUT'));s=await summary(f,p.id);assert.equal(s.capital,7000);assert.equal(s.shares,80);assert.equal(s.shareRedemptionDue,0);
});
test('invalid payment confirmations, wrong directions, overpayments, mismatched investor and duplicate share settlement are rejected',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f);const before=structuredClone(f.state);
 await assert.rejects(post(f,p.id,purchase({paymentStatus:undefined})),/Confirm whether/);
 for(const paidAmount of [0,10000,12000])await assert.rejects(post(f,p.id,purchase({paymentStatus:'PARTIAL',paidAmount})),/partial payment/);
 assert.deepEqual(f.state,before);
 const t=await post(f,p.id,purchase());
 await assert.rejects(post(f,p.id,settle(t.result.id,10001)),/exceeds/);
 await assert.rejects(post(f,p.id,settle(t.result.id,100,'2026-01-03','CAPITAL_OUT')),/direction/);
 await assert.rejects(post(f,p.id,settle(t.result.id,100,'2026-01-01')),/existing share due/);
 await assert.rejects(post(f,p.id,{...settle(t.result.id,100),pricePerShare:100}),/cannot move shares/);
 const other=await person(f);await assert.rejects(post(f,other.id,settle(t.result.id,100)),/existing share due/);
 await assert.rejects(f.call(`/investors/${p.id}/share-dues`,'GET',{}, {},'b'),/not found/);
 await post(f,p.id,settle(t.result.id,10000));await assert.rejects(post(f,p.id,settle(t.result.id,1,'2026-01-04')),/exceeds/);
});
test('payment reversal reopens due without changing units, and unpaid trade cancellation restores units',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),trade=await post(f,p.id,purchase()),payment=await post(f,p.id,settle(trade.result.id,4000));
 await assert.rejects(f.call(`/investors/${p.id}/reverse/${trade.result.id}`,'POST',{date:'2026-01-04',reason:'Cancel'}),/capital payments/);
 await f.call(`/investors/${p.id}/reverse/${payment.result.id}`,'POST',{date:'2026-01-04',reason:'Wrong payment'});
 let s=await summary(f,p.id);assert.equal(s.shares,100);assert.equal(s.capital,0);assert.equal(s.shareCapitalDue,10000);
 await f.call(`/investors/${p.id}/reverse/${trade.result.id}`,'POST',{date:'2026-01-05',reason:'Cancelled purchase'});
 s=await summary(f,p.id);assert.equal(s.shares,0);assert.equal(s.shareCapitalDue,0);assert.equal(s.capital,0);
 assert.equal((await f.call(`/investors/${p.id}/share-dues`)).trades[0].status,'CANCELLED');
});
test('pending trade plus invalid confirmed cash rolls back ownership and event; future settlements prevent historical overpayment',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),before=structuredClone(f.state),input=purchase({paymentStatus:'PAID'});
 const preview=await f.call(`/investors/${p.id}/capital-preview`,'GET',{},input);
 await assert.rejects(f.call(`/investors/${p.id}/events`,'POST',{...input,requestId:randomUUID(),previewHash:preview.previewHash,counterAccountId:'missing'}),/active counterpart/);assert.deepEqual(f.state,before);
 const trade=await post(f,p.id,purchase());await post(f,p.id,settle(trade.result.id,8000,'2026-01-05'));
 const current=structuredClone(f.state);await assert.rejects(post(f,p.id,settle(trade.result.id,3000,'2026-01-04')),/overpay/);assert.deepEqual(f.state,current);
 await f.call('/investors/share-settings','PUT',{includeShares:false,totalShares:1000});await post(f,p.id,settle(trade.result.id,2000,'2026-01-06'));assert.equal((await summary(f,p.id)).shareCapitalDue,0);
});


test('same-transaction PostgreSQL timestamps sort the trade before its cash payment even when its UUID sorts later',async()=>{
 const f=createInvestorFlowFixture(),p=await person(f),t=await post(f,p.id,purchase({paymentStatus:'PARTIAL',paidAmount:4000}));
 const order=f.state.events.find((e:any)=>e.id===t.result.id),payment=f.state.events.find((e:any)=>e.id===t.result.paymentId);
 order.id='ffffffff-ffff-4fff-8fff-ffffffffffff';payment.id='00000000-0000-4000-8000-000000000000';payment.details.settleTradeId=order.id;
 order.created_at=payment.created_at='2026-01-02T00:00:00.000Z';
 const detail=await f.call(`/investors/${p.id}`);assert.equal(detail.events[0].kind,'SHARE_BUY');
 await post(f,p.id,settle(order.id,1000));assert.equal((await summary(f,p.id)).shareCapitalDue,5000);
});


test('due calculations accept PostgreSQL Date values as well as serialized dates and honor as-of boundaries',()=>{
 const trade={id:'trade',kind:'SHARE_BUY',amount:1000,event_date:new Date('2026-01-02T00:00:00Z'),details:{pricePerShare:100,capitalPreview:{shareQuantity:10}}};
 const payment={kind:'CAPITAL_IN',amount:400,event_date:new Date('2026-01-03T00:00:00Z'),journal_status:'PUBLISHED',details:{settleTradeId:'trade'}};
 assert.equal(shareDues([trade,payment],'2026-01-01').length,0);assert.equal(shareDues([trade,payment],'2026-01-02')[0].due,1000);assert.equal(shareDues([trade,payment],'2026-01-03')[0].due,600);
});
