import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('composables/useSelectedAccounts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('export function','function');
let calls=0,refreshes=0;
const auth={session:{value:{companyId:'a',selectedAccounts:{companyId:'a',defaults:{purchase:{stock:'stock-a'}}}}},updateSession:async()=>{refreshes++}};
const api=new Function('useNuxtApp','$fetch',source+';return useSelectedAccounts()')(()=>({$auth:auth}),async(_url,options)=>{calls++;return {companyId:options.body.companyId,defaults:{purchase:{stock:'fresh-'+options.body.companyId}}}});
const cached=await api.get('a');assert.equal(calls,0);assert.equal(cached.defaults.purchase.stock,'stock-a');
cached.defaults.purchase.stock='changed';assert.equal(auth.session.value.selectedAccounts.defaults.purchase.stock,'stock-a');
assert.equal((await api.get('b')).defaults.purchase.stock,'fresh-b');assert.equal(refreshes,0);
await api.refresh('a');assert.equal(refreshes,1);assert.equal(calls,2);
delete auth.session.value.selectedAccounts;await api.get('a');assert.equal(refreshes,2);
console.log('Auth-session account defaults passed: immediate reads, isolated form copies, other-company isolation and refresh.');
for (const file of ['components/Investments/ProfileModal.vue','components/Investments/MovementModal.vue','components/Accountant/MoneyPage.vue','components/Accountant/AccountTransfersPage.vue','components/Accountant/AccountantManagementPage.vue','components/Distributor/AccountSelection.vue']) {
  const component=fs.readFileSync(file,'utf8');
  assert.ok(component.includes('useSelectedAccounts()'),file+' uses the auth-session defaults');
  assert.ok(!component.includes('/account-settings/defaults'),file+' does not fetch selected defaults from the accounts API');
}
