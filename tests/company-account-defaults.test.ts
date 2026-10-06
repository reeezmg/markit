import assert from 'node:assert/strict';
import { provisionCompanyAccountDefaults, standardCompanyAccounts } from '../server/utils/accountant/company-account-defaults';
const accounts:any[]=[],audits:any[]=[],configs:Record<string,any>={};
let writes=0;
const sql={query:async(statement:string,args:any[]=[])=>{
  const company=args[0];
  if(statement.startsWith('SELECT id,currency'))return {rows:[{id:company,currency:company==='b'?'USD':'INR'}]};
  if(statement.startsWith('SELECT * FROM accountant_v2_accounting_accounts'))return {rows:accounts.filter(a=>a.company_id===company)};
  if(statement.startsWith('INSERT INTO accountant_v2_accounting_accounts')){writes++;for(const a of JSON.parse(args[2]))accounts.push({id:a.id,company_id:company,name:a.name,code:a.code,category:a.category,account_type:a.accountType,currency:args[1],is_active:true,deleted_at:null,is_primary:a.code==='PRIMARY-BANK'});return {rows:[]};}
  if(statement.includes('SELECT * FROM accountant_v2_accountant_audit'))return {rows:audits.filter(a=>a.company_id===company).slice().reverse()};
  if(statement.startsWith('INSERT INTO accountant_v2_accountant_audit')){writes++;audits.push({id:args[0],company_id:args[1],resource:args[3],resourceId:args[4],after:JSON.parse(args[5])});return {rows:[]};}
  if(statement.startsWith('SELECT id FROM accountant_v2_investors'))return {rows:[]};
  const table=statement.match(/(?:FROM|INTO) (accountant_v2_(?:erp|user|ecommerce)_settings)/)?.[1];
  if(table){const key=`${company}:${table}`;if(statement.startsWith('SELECT'))return {rows:configs[key]?[configs[key]]:[]};writes++;configs[key]={enabled:false,...configs[key],accounts:JSON.parse(args[1])};return {rows:[]};}
  throw Error('Unexpected SQL '+statement);
}};
const a=await provisionCompanyAccountDefaults(sql,'a','owner-a');
assert.equal(a.createdAccounts.length,standardCompanyAccounts.length);
assert.ok(accounts.every(row=>row.currency==='INR'));
assert.equal(a.settings.investments.capitalAccountId,accounts.find(a=>a.code==='3000').id);
assert.notEqual(a.settings.transfers.fromAccountId,a.settings.transfers.toAccountId);
for(const fields of Object.values(a.settings))if(typeof fields==='object')for(const id of Object.values(fields))assert.ok(accounts.some(a=>a.id===id&&a.company_id==='a'));
assert.ok(Object.values(configs).every((s:any)=>!s.enabled));
const before=writes;
const again=await provisionCompanyAccountDefaults(sql,'a','owner-a');
assert.equal(again.createdAccounts.length,0);assert.equal(again.changedSettings.length,0);assert.equal(writes,before);
// JSONB may return mapping keys in a different order; it must not cause repeat writes.
for(const value of Object.values(configs))value.accounts=Object.fromEntries(Object.entries(value.accounts).reverse());
assert.equal((await provisionCompanyAccountDefaults(sql,'a','owner-a')).changedSettings.length,0);
accounts.push({id:'custom-cash',company_id:'a',name:'Till',code:'CUSTOM-CASH',category:'ASSET',account_type:'CASH',currency:'INR',is_active:true,deleted_at:null});
configs['a:accountant_v2_erp_settings'].enabled=true;configs['a:accountant_v2_erp_settings'].accounts.cash='custom-cash';
await provisionCompanyAccountDefaults(sql,'a','owner-a');
assert.equal(configs['a:accountant_v2_erp_settings'].accounts.cash,'custom-cash');assert.equal(configs['a:accountant_v2_erp_settings'].enabled,true);
const b=await provisionCompanyAccountDefaults(sql,'b','owner-b');
assert.ok(b.createdAccounts.every(row=>accounts.find(a=>a.id===row.id)?.currency==='USD'));
assert.notEqual(b.settings.investments.capitalAccountId,a.settings.investments.capitalAccountId);
assert.equal((await provisionCompanyAccountDefaults(sql,'b','owner-b')).changedSettings.length,0);
configs['b:accountant_v2_erp_settings'].accounts.cash='custom-cash';
await assert.rejects(provisionCompanyAccountDefaults(sql,'b','owner-b'),/Invalid existing erp\/cash/);
console.log('Company provisioning passed: full defaults, company-owned IDs/currency, idempotence, JSONB ordering, custom selections, disabled activation and cross-company rejection.');
