import assert from 'node:assert/strict';
import { selectDistributorAccounts } from '../server/utils/distributor-account-selection';
import { creditAccountSelection, creditAccountRoles, distributorCreditKind } from '../utils/distributor-credit-kind';
import { distributorAccountingTransactions } from '../utils/distributor-accounting-transactions';

function database({ enabled=true, invalidExpense=false, existing={} as Record<string,string> }={}) {
  let snapshot: any;
  const db={ async query(sql:string,args:any[]=[]) {
    if(sql.includes('SELECT enabled')) return {rows:[{enabled}]};
    if(sql.includes('SELECT accounts')) return {rows:Object.keys(existing).length?[{accounts:existing}]:[]};
    if(sql.includes('SELECT "after"')) return {rows:[]};
    if(sql.includes('SELECT role')) return {rows:[{role:'payable',account_id:'ap'},{role:'stock',account_id:'inventory'},{role:'bank',account_id:'bank'}]};
    if(sql.includes('SELECT 1 FROM accountant_v2_accounting_accounts')) {
      assert.equal(args[1],'company-a');
      const accountTypes:Record<string,string>={ap:'ACCOUNTS_PAYABLE',shipping:'EXPENSE',general:'OTHER_EXPENSE',inventory:'STOCK',bank:'BANK',foreign:'EXPENSE'};
      return {rowCount:args[0]!=='foreign' && !(invalidExpense && args[0]==='shipping') && args[2].includes(accountTypes[args[0]])?1:0};
    }
    if(sql.includes('INSERT INTO accountant_v2_distributor_sources')) snapshot=JSON.parse(args[3]);
    return {rows:[]};
  }};
  return {db,get snapshot(){return snapshot;}};
}

assert.deepEqual(creditAccountRoles('CHARGE','BANK'),['payable','expense']);
assert.deepEqual(creditAccountSelection('CHARGE','BANK',{payable:'ap',expense:'shipping',stock:'inventory',bank:'bank'}),{payable:'ap',expense:'shipping'});
assert.deepEqual(creditAccountSelection('PRODUCT','BANK',{stock:'inventory',expense:'shipping'}),{stock:'inventory'});
assert.deepEqual(creditAccountSelection('AMOUNT','BANK',{bank:'bank',expense:'shipping'}),{bank:'bank'});
assert.equal(distributorCreditKind(null,{expense:'shipping',stock:'shipping'}),'CHARGE');
assert.equal(distributorCreditKind('money',{}),'AMOUNT');
assert.equal(distributorCreditKind(null,{}),'PRODUCT');

const created=database();
await selectDistributorAccounts(created.db,'company-a','supplier','credit:dc',{payable:'ap',expense:'shipping'},true);
assert.deepEqual(created.snapshot,{payable:'ap',stock:'shipping',bank:'bank',expense:'shipping'});
const edited=database({existing:created.snapshot});
await selectDistributorAccounts(edited.db,'company-a','supplier','credit:dc',{expense:'general'},true);
assert.equal(edited.snapshot.expense,'general');assert.equal(edited.snapshot.stock,'general');
for(const expense of ['inventory','bank','foreign']) {
  const invalid=database();
  await assert.rejects(selectDistributorAccounts(invalid.db,'company-a','supplier','credit:dc',{expense},true));
  assert.equal(invalid.snapshot,undefined);
}
await assert.rejects(selectDistributorAccounts(database({invalidExpense:true}).db,'company-a','supplier','credit:dc',{expense:'shipping'},true));
await assert.rejects(selectDistributorAccounts(database({enabled:false}).db,'company-a','supplier','credit:dc',{expense:'shipping'},true));
await assert.rejects(selectDistributorAccounts(database().db,'company-a','supplier','credit:dc',{},true));
await assert.rejects(selectDistributorAccounts(database().db,'company-a','supplier','purchase:po',{expense:'shipping'},true));
await assert.rejects(selectDistributorAccounts(database().db,'company-a','supplier','credit:dc',{expense:'shipping'}));
const product=database();
await selectDistributorAccounts(product.db,'company-a','supplier','credit:product',{stock:'inventory'});
assert.equal(product.snapshot.stock,'inventory');assert.equal(product.snapshot.expense,undefined);

const rows=distributorAccountingTransactions({
  sources:[{source_key:'credit:dc',journal_id:'current',accounts:created.snapshot}],
  events:[{source_key:'credit:dc',kind:'PURCHASE',source_kind:'CREDIT',source_reference:'DC-10'}],
  ledger:[
    {id:'old',journal_date:'2026-03-13',side:'CREDIT',amount:200,account_type:'ACCOUNTS_PAYABLE'},
    {id:'current',journal_date:'2026-03-13',side:'CREDIT',amount:300,account_type:'ACCOUNTS_PAYABLE'},
    {id:'current',journal_date:'2026-03-13',side:'DEBIT',amount:300,account_type:'EXPENSE'},
  ],
});
assert.equal(rows.length,1);assert.equal(rows[0].type,'CHARGE_CREDIT');assert.equal(rows[0].reference,'DC-10');
assert.equal(rows[0].credit,300);assert.equal(rows[0].debit,0);assert.equal(rows[0].due,300);
assert.equal(rows[0].lines.length,2);
console.log('Charge Credit passed: account isolation, create/edit snapshots, invalid/inactive/foreign accounts, product/amount compatibility and source-only payable display.');
