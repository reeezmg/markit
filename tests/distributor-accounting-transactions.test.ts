import assert from 'node:assert/strict';
import { distributorAccountingTransactions } from '../utils/distributor-accounting-transactions';
const line = (id: string, side: string, amount: number, type='ACCOUNTS_PAYABLE') => ({id,side,amount,account_type:type,journal_date:'2026-01-01',source_type:id==='reverse'?'DISTRIBUTOR_REVERSAL':'DISTRIBUTOR'});
const data = {
  ledger:[line('purchase','CREDIT',100),line('purchase','DEBIT',100,'STOCK'),line('payment','DEBIT',30),line('payment','CREDIT',30,'CASH'),line('reverse','CREDIT',30)],
  sources:[{journal_id:'purchase',source_key:'purchase:po'},{journal_id:'payment',source_key:'payment:dp'}],
  events:[{source_key:'purchase:po',kind:'PURCHASE'},{source_key:'payment:dp',kind:'PAYMENT'}],
};
const rows = distributorAccountingTransactions(data);
assert.equal(rows.length,2);
assert.deepEqual(rows.map(r=>r.due),[100,70]);
assert.equal(rows[0].lines.length,2);
assert.equal(rows[0].type,'PURCHASE');
assert.equal(rows[1].type,'PAYMENT');
assert.equal(rows.filter(r=>r.debit>0)[0].due,70);
assert.deepEqual(distributorAccountingTransactions({}),[]);
const edited = {...data, ledger:[line('old','CREDIT',38590),line('reverse','DEBIT',38590),line('purchase','CREDIT',40815),line('payment','DEBIT',30)]};
assert.deepEqual(distributorAccountingTransactions(edited).map(r=>[r.id,r.type,r.due]),[['purchase','PURCHASE',40815],['payment','PAYMENT',40785]],'Old purchase and its reversal must not affect rows or running due');
assert.deepEqual(distributorAccountingTransactions({...data,events:[]}),[],'Removed sources are hidden');
assert.deepEqual(distributorAccountingTransactions({...data,sources:[]}),[],'Unlinked journals are hidden');
assert.deepEqual(distributorAccountingTransactions({ledger:[line('reverse','DEBIT',30)],sources:[{journal_id:'reverse',source_key:'payment:dp'}],events:data.events}),[],'Reversals never appear even with an invalid pointer');
assert.deepEqual(distributorAccountingTransactions({ledger:[line('purchase','CREDIT',100)],sources:[{journal_id:'purchase',source_key:'purchase:po',distributor_id:'supplier-a'}],events:[{source_key:'purchase:po',kind:'PURCHASE',distributor_id:'supplier-b'}]}),[],'Source must belong to the matching supplier');
const opening = distributorAccountingTransactions({ledger:[line('opening','CREDIT',1000)],sources:[{journal_id:'opening',source_key:'opening'}],events:[{source_key:'opening',kind:'OPENING'}]});
assert.equal(opening[0].due,1000);assert.equal(opening[0].type,'OPENING');
const referenced = distributorAccountingTransactions({...data,
  ledger: data.ledger.map(l=>({...l,entry_number:`DIST-${l.id}`,reference_number:'Supplier invoice'})),
  events:[{source_key:'purchase:po',kind:'PURCHASE',reference:'Supplier invoice',source_reference:'PO-218'},
    {source_key:'payment:dp',kind:'PAYMENT',source_reference:'DP-27'}],
});
assert.deepEqual(referenced.map(r=>r.reference),['PO-218','DP-27'],'Source numbers override journal and supplier invoice references');
const credit = distributorAccountingTransactions({ledger:[line('credit','CREDIT',34500)],
  sources:[{journal_id:'credit',source_key:'credit:dc'}],
  events:[{source_key:'credit:dc',kind:'PURCHASE',source_kind:'CREDIT',source_reference:'DC-4'}]});
assert.equal(credit[0].reference,'DC-4');assert.equal(credit[0].type,'CREDIT');assert.equal(credit[0].due,34500);
const receiptCredit = distributorAccountingTransactions({ledger:[line('credit','CREDIT',500)],
  sources:[{journal_id:'credit',source_key:'credit:dc'}],
  events:[{source_key:'credit:dc',kind:'RECEIPT',source_kind:'CREDIT',source_reference:'CUSTOM-4'}]});
assert.equal(receiptCredit[0].type,'CREDIT');assert.equal(receiptCredit[0].reference,'CUSTOM-4');assert.equal(receiptCredit[0].due,500);
assert.equal(rows[0].reference,'purchase:po','Missing references fall back to the source key, never DIST');
const withExpenses = distributorAccountingTransactions({
  ledger: [...data.ledger, line('expense','DEBIT',250,'EXPENSE'), line('expense','DEBIT',50,'INPUT_TAX'), line('expense','CREDIT',300,'BANK'), line('charge','DEBIT',300,'EXPENSE'), line('charge','CREDIT',300)],
  sources: [...data.sources, {journal_id:'expense',source_key:'expense:ex'}, {journal_id:'charge',source_key:'credit:charge',accounts:{expense:'charges-account'}}],
  events: [...data.events, {source_key:'expense:ex',kind:'EXPENSE'}, {source_key:'credit:charge',kind:'PURCHASE',source_kind:'CREDIT'}],
});
assert.deepEqual(withExpenses.map(r=>[r.id,r.debit,r.credit,r.due]), [['purchase',0,100,100],['payment',30,0,70],['charge',0,300,370]], 'Ordinary expenses and tax must not appear as supplier settlement; Charge Credit must remain');
assert.equal(withExpenses[2].type,'CHARGE_CREDIT');
assert.equal(withExpenses[2].lines.length,2,'Charge details retain the expense counterpart');
assert.equal(withExpenses.reduce((sum,r)=>sum+r.credit-r.debit,0),withExpenses.at(-1)?.due,'Displayed credits minus debits tally with closing due');
console.log('Distributor ledger regression checks passed, including expense exclusion and Charge Credit.');
