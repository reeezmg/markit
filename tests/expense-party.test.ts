import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expensePartyFields, expensePartyFromRow, normalizeExpenseParty } from '../utils/expense-party';
import { validateExpenseParty, markExpensePartyChange, syncExpensePartyLines } from '../server/utils/expense-party';
import { distributorAccountingTransactions } from '../utils/distributor-accounting-transactions';

test('party selection stores exactly one typed ID and supports clearing', () => {
  for (const kind of ['user','distributor','client'] as const) {
    const fields = expensePartyFields({kind,id:'same-id',name:'Same name'});
    assert.equal(fields[`${kind}Id`], 'same-id');
    assert.equal(Object.values(fields).filter(Boolean).length, 1);
    assert.deepEqual(normalizeExpenseParty(fields), fields);
  }
  assert.deepEqual(expensePartyFields(null), {userId:null,distributorId:null,clientId:null});
  assert.throws(() => normalizeExpenseParty({userId:'a',clientId:'b'}), /one expense party/);
  assert.throws(() => normalizeExpenseParty({distributorId:7}), /Invalid/);
});
test('legacy users load and omitted party fields preserve an existing link', () => {
  assert.equal(expensePartyFromRow({userId:'u',user:{name:'Staff'}})?.kind,'user');
  assert.deepEqual(normalizeExpenseParty({note:'change'}, {distributorId:'d'}), {userId:null,distributorId:'d',clientId:null});
  assert.deepEqual(normalizeExpenseParty({clientId:'c'}, {distributorId:'d'}), {userId:null,distributorId:null,clientId:'c'});
});
test('party ownership is validated and locked for every party kind', async () => {
  for (const kind of ['user','distributor','client'] as const) {
    const calls: any[] = [];
    const db = {query: async (sql: string, args: any[]) => { calls.push([sql,args]); return {rowCount:0}; }};
    await assert.rejects(validateExpenseParty(db,'company-a',{[`${kind}Id`]:'foreign'}), /does not belong/);
    assert.deepEqual(calls[0][1], ['company-a','foreign']);
    assert.match(calls[0][0], /FOR SHARE/);
  }
});
test('party-only changes invalidate the native signature and posting precedes dimensions', async () => {
  const calls: any[] = [];
  const db = {query: async (sql: string, args?: any[]) => { calls.push([sql,args]); return {rows:[],rowCount:1}; }};
  await markExpensePartyChange(db,'company','expense',{distributorId:'d'}, {userId:null,distributorId:'d',clientId:null});
  assert.equal(calls.length,0);
  await markExpensePartyChange(db,'company','expense',{distributorId:'d'}, {userId:null,distributorId:null,clientId:'c'});
  assert.deepEqual(calls[0][1],['company','expense']);
  await syncExpensePartyLines(db,'company',['expense']);
  assert.equal(calls[1][0],'SET CONSTRAINTS ALL IMMEDIATE');
  assert.match(calls[2][0], /NOT EXISTS.*distributor_payments/s);
  assert.deepEqual(calls[2][1],['company',['expense']]);
});
test('expenses are source linked, include tax, and do not settle purchase dues', () => {
  const ledger = [
    {id:'po',side:'CREDIT',amount:1000,account_type:'ACCOUNTS_PAYABLE',journal_date:'2026-01-01'},
    {id:'expense',side:'DEBIT',amount:100,account_type:'EXPENSE',journal_date:'2026-01-02'},
    {id:'expense',side:'DEBIT',amount:18,account_type:'OTHER_CURRENT_ASSET',journal_date:'2026-01-02'},
    {id:'expense',side:'CREDIT',amount:118,account_type:'CASH',journal_date:'2026-01-02'},
    {id:'old-expense',side:'DEBIT',amount:200,account_type:'EXPENSE',journal_date:'2026-01-02'},
  ];
  const rows=distributorAccountingTransactions({ledger,sources:[{journal_id:'po',source_key:'purchase:p'},{journal_id:'expense',source_key:'expense:e'}],events:[{source_key:'purchase:p',kind:'PURCHASE'},{source_key:'expense:e',kind:'EXPENSE',source_reference:'EXP-9'}]});
  assert.equal(rows.length,2);
  assert.equal(rows[1].sourceKey,'expense:e');
  assert.equal(rows[1].reference,'EXP-9');
  assert.equal(rows[1].debit,118);
  assert.equal(rows[1].due,1000);
});
