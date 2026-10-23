import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

const calls = [], downloads = [], notices = [], companyId = Vue.ref('company');
let holdExport, releaseExport, incomplete = false;
const account = { id: 'bank', name: 'Bank', currency: 'INR', category: 'ASSET', accountType: 'BANK', isActive: true, parentId: null };
Object.assign(globalThis, Vue, {
  __downloadAccountLedger: async (...args) => downloads.push(args),
  useRoute: () => ({ query: {} }), useToast: () => ({ add: notice => notices.push(notice) }),
  useAccountantApi: () => ({ companyId, get: async (path, options) => {
    const query = { ...options?.query }; calls.push({ path, company: companyId.value, query });
    if (!path.endsWith('/ledger')) return { data: [account], baseCurrency: 'INR' };
    if (query.export) {
      if (holdExport) await holdExport;
      return { companyName: 'Example Company', account, sourceTypes: [], total: 3,
        data: incomplete ? [] : [1, 2, 3].map(id => ({ id, sourceNote: 'Source note' })) };
    }
    return { account, sourceTypes: [], total: 3, data: [{ id: 1 }] };
  } }),
});
const source = readFileSync('components/Accountant/ChartOfAccountsPage.vue', 'utf8')
  .replace("import('~/utils/account-ledger-export.client')", 'Promise.resolve({ downloadAccountLedger: globalThis.__downloadAccountLedger })');
const { descriptor } = parse(source);
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'ChartOfAccountsPage.vue', id: 'downloads' }).errors, []);
const script = compileScript(descriptor, { id: 'downloads' });
mkdirSync('.cache/accountant-pages', { recursive: true });
const file = resolve('.cache/accountant-pages/ledger-download-test.mjs');
writeFileSync(file, ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const component = (await import(pathToFileURL(file).href)).default; component.render = () => null;
const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {} });
const app = renderer.createApp(component), queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
app.use(VueQueryPlugin, { queryClient }); const instance = app.mount({}), state = instance.$.setupState;
const settle = async () => { for (let i = 0; i < 5; i++) { await Vue.nextTick(); await new Promise(r => setTimeout(r, 5)); } };
await settle(); state.selectedId = 'bank'; await settle();
state.ledgerFrom = '2026-03-01'; state.ledgerTo = '2026-03-31'; state.ledgerSide = 'CREDIT';
state.ledgerMin = '5'; state.ledgerOrder = 'asc'; state.ledgerPageSize = 10; await settle();
state.ledgerPage = 2; await settle(); state.ledgerSearch = 'fee';
await state.exportLedger('pdf');
const request = calls.findLast(c => c.query.export);
assert.equal(request.company, 'company'); assert.equal(request.query.export, 'all'); assert.equal(request.query.page, 1);
assert.equal(request.query.from, '2026-03-01'); assert.equal(request.query.to, '2026-03-31');
assert.equal(request.query.side, 'CREDIT'); assert.equal(request.query.search, 'fee'); assert.equal(request.query.minAmount, 5);
assert.equal(downloads[0][0], 'pdf'); assert.equal(downloads[0][1].data.length, 3, 'Download includes rows beyond the visible page');
await state.exportLedger('excel'); assert.equal(downloads[1][0], 'excel');
incomplete = true; await state.exportLedger('excel');
assert.equal(downloads.length, 2); assert.ok(notices.some(n => n.title === 'Could not download account ledger'));
incomplete = false; holdExport = new Promise(resolve => { releaseExport = resolve; });
const pending = state.exportLedger('pdf'); await settle(); companyId.value = 'branch'; releaseExport(); await pending;
assert.equal(downloads.length, 2, 'Changing company while fetching cannot download a stale company ledger');
assert.equal(state.exporting, false);
app.unmount(); queryClient.clear(); delete globalThis.__downloadAccountLedger;
console.log('Chart download workflow passed: PDF/Excel, all matching rows, current filters, incomplete-result errors and company-switch protection.');
