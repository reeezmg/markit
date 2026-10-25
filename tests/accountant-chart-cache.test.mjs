import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { QueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';

const client = new QueryClient();
const load = (file, bindings, name) => {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/^import .*;?\r?\n/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(bindings), source + `\nreturn ${name}`)(...Object.values(bindings));
};
const keys = [ ['accountant-v2', 'company', 'chart-directory'], ['accountant-v2', 'company', 'chart-ledger', 'cash'], ['accountant-v2', 'branch', 'chart-ledger', 'cash'] ];
const seed = () => { client.clear(); for (const key of keys) client.setQueryData(key, { data: [] }); };
const stale = key => client.getQueryState(key).isInvalidated;
const state = new Map();
const useModelCache = load('composables/useModelCache.ts', {
  useQueryClient: () => client,
  useState: (key, initial) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  },
}, 'useModelCache');
for (const source of ['PurchaseOrder', 'DistributorPayment', 'Bill', 'Expense']) {
  seed(); await useModelCache().invalidateModels(source);
  assert.ok(keys.every(stale), `${source} refreshes cached charts`);
}
seed();
let fail = false;
const useAccountantApi = load('composables/useAccountantApi.ts', {
  useQueryClient: () => client, useToast: () => ({ add() {} }),
  useSelectedAccounts: () => ({ get: async () => ({}), refresh: async () => ({}) }),
  useCompanyScope: () => ({ companyId: ref('company'), fetch: async () => { if (fail) throw Error('failed'); return {}; } }),
}, 'useAccountantApi');
await useAccountantApi().post('/manual-journals', {});
assert.ok(stale(keys[0]) && stale(keys[1]));
assert.equal(stale(keys[2]), false, 'Accountant mutations invalidate only the owning company');
seed(); await useAccountantApi().get('/accounting-accounts');
assert.ok(keys.every(key => !stale(key)), 'Reads preserve cache freshness');
fail = true; await assert.rejects(useAccountantApi().patch('/accounting-accounts/cash', {}));
assert.ok(keys.every(key => !stale(key)), 'Failed writes do not invalidate the cache');
client.clear();
console.log('Chart cache refresh passed for source writes and company-scoped Accountant mutations.');
