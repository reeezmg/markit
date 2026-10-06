import 'dotenv/config';
import assert from 'node:assert/strict';
import { accountantContext } from '../server/utils/accountant/context';
import { accountSettingsRouter } from '../server/utils/accountant/account-settings';
import { selectDistributorAccounts } from '../server/utils/distributor-account-selection';

const accounts = [
  { id: 'cash-a', companyId: 'a', accountType: 'CASH', isActive: true, deletedAt: null },
  { id: 'bank-a', companyId: 'a', accountType: 'BANK', isActive: true, deletedAt: null },
  { id: 'equity-a', companyId: 'a', accountType: 'EQUITY', isActive: true, deletedAt: null },
  { id: 'cash-b', companyId: 'b', accountType: 'CASH', isActive: true, deletedAt: null },
  { id: 'inactive', companyId: 'a', accountType: 'CASH', isActive: false, deletedAt: null },
  { id: 'distribution', companyId: 'a', category: 'EQUITY', accountType: 'EQUITY', isActive: true, deletedAt: null },
  { id: 'owned-equity', companyId: 'a', category: 'EQUITY', accountType: 'EQUITY', isActive: true, deletedAt: null },
];
const audits: any[] = [];
const matches = (row: any, where: any) => Object.entries(where).every(([k,v]: any) => v?.in ? v.in.includes(row[k]) : row[k] === v);
const db: any = {
  accountantAccountingAccount: { findMany: async ({ where }: any) => accounts.filter(a => matches(a, where)), findFirst: async ({where}:any) => accounts.find(a=>matches(a,where)) },
  $queryRawUnsafe: async (_sql:string, companyId:string, id:string) => companyId === 'a' && id === 'owned-equity' ? [{id:'investor'}] : [],
  accountantAudit: {
    findMany: async ({ where }: any) => audits.filter(a => matches(a, where)).reverse(),
    create: async ({ data }: any) => { const row = { ...data, deletedAt: null }; audits.push(row); return row; },
  },
};
async function call(method: string, path: string, body: any = {}, companyId = 'a', role = 'admin') {
  let result: any;
  await accountantContext.run({ companyId, userId: 'tester', role, db }, () => accountSettingsRouter.dispatch(method,path,{user:{companyId,userId:'tester',role},body,query:{},params:{}},{json:(r:any)=>{result=r;},status:()=>{}} as any));
  return result;
}
await call('PUT','/investments',{mappings:{capitalAccountId:'equity-a',counterAccountId:'cash-a'}});
assert.equal((await call('GET','/defaults')).defaults.investments.capitalAccountId,'equity-a');
assert.deepEqual((await call('GET','/defaults',{},'b')).defaults,{});
for (const bad of ['cash-b','inactive','equity-a']) await assert.rejects(call('PUT','/receive',{mappings:{moneyAccountId:bad}}));
await assert.rejects(call('PUT','/transfers',{mappings:{fromAccountId:'cash-a',toAccountId:'cash-a'}}));
await assert.rejects(call('PUT','/unknown',{mappings:{}}));
await assert.rejects(call('PUT','/receive',{mappings:{moneyAccountId:'cash-a'}},'a','user'));
await call('PUT','/investments',{mappings:{}});
assert.deepEqual((await call('GET','/defaults')).defaults.investments,{},'Clearing a default must not fall back to an older saved value');
await call('PUT','/investments',{mappings:{capitalAccountId:'equity-a',counterAccountId:'cash-a'},profitDistributionAccountId:'distribution'});
assert.equal((await call('GET','/defaults')).defaults.investments.capitalAccountId,'equity-a');
assert.equal(audits.at(-1).resource,'investor-profit-settings');
assert.equal(audits.at(-1).after.accountId,'distribution');
const auditCount=audits.length;
for(const id of ['cash-a','cash-b','owned-equity','missing'])await assert.rejects(call('PUT','/investments',{mappings:{capitalAccountId:'equity-a'},profitDistributionAccountId:id}));
await assert.rejects(call('PUT','/investments',{mappings:{capitalAccountId:'distribution'},profitDistributionAccountId:'distribution'}));
await assert.rejects(call('PUT','/investments',{mappings:{capitalAccountId:'equity-a'},profitDistributionAccountId:'distribution'},'a','accountant'));
await assert.rejects(call('PUT','/receive',{mappings:{moneyAccountId:'cash-a'},profitDistributionAccountId:'distribution'}));
assert.equal(audits.length,auditCount,'Invalid combined saves must validate both settings before writing either audit');
await call('PUT','/investments',{mappings:{capitalAccountId:'equity-a'}},'a','accountant');
assert.equal(audits.length,auditCount+1,'Accountants can still save defaults without changing the distribution account');
await call('PUT','/receive-pay',{receiveAccountId:'cash-a',payAccountId:'bank-a'});
assert.deepEqual((await call('GET','/defaults')).defaults.receive,{moneyAccountId:'cash-a'});
assert.deepEqual((await call('GET','/defaults')).defaults.pay,{moneyAccountId:'bank-a'});
const moneyAuditCount=audits.length;
await assert.rejects(call('PUT','/receive-pay',{receiveAccountId:'cash-a',payAccountId:'cash-b'}));
await assert.rejects(call('PUT','/receive-pay',{receiveAccountId:'equity-a',payAccountId:'bank-a'}));
assert.equal(audits.length,moneyAuditCount,'Validate both Receive/Pay selections before writing either');
await call('PUT','/receive-pay',{receiveAccountId:'',payAccountId:''});
assert.deepEqual((await call('GET','/defaults')).defaults.receive,{});
assert.deepEqual((await call('GET','/defaults')).defaults.pay,{});

async function purchase(recorded: any, overrides: any, enabled = true) {
  let written: any = null;
  const connection = { query: async (sql: string, params: any[]) => {
    if(sql.includes('SELECT enabled')) return {rows:[{enabled}]};
    if(sql.includes('pg_advisory')) return {rows:[]};
    if(sql.includes('SELECT accounts')) return {rows:recorded ? [{accounts:recorded}] : []};
    if(sql.includes('SELECT "after"')) return {rows:[{after:{cash:'cash-a'}}]};
    if(sql.includes('SELECT 1 FROM accountant_v2_accounting_accounts')) return {rowCount: accounts.filter(a=>a.id===params[0]&&a.companyId===params[1]&&a.isActive&&params[2].includes(a.accountType)).length};
    if(sql.includes('SELECT role')) return {rows:[{role:'cash',account_id:'previous'}]};
    if(sql.includes('INSERT INTO accountant_v2_distributor_sources')) { written=JSON.parse(params[3]);return {rows:[]}; }
    throw Error('Unexpected query: '+sql);
  } };
  await selectDistributorAccounts(connection,'a','supplier','payment:test',overrides);
  return written;
}
assert.equal((await purchase(null,undefined)).cash,'cash-a','New payment uses configured default');
assert.equal((await purchase(null,{cash:'cash-b'}).catch(()=>null)),null,'Invalid explicit override rejects');
assert.equal(await purchase({cash:'previous'},undefined),null,'Existing payment is not remapped by new defaults');
assert.equal((await purchase({cash:'previous'},{cash:'cash-a'})).cash,'cash-a','Explicit transaction edit wins');
assert.equal(await purchase(null,undefined,false),null,'Settings do not silently enable supplier posting');
console.log('Account settings passed: company/role/type validation, cleared defaults, purchase defaults, overrides and recorded-account preservation.');
