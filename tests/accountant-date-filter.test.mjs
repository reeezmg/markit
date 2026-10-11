import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';
import * as Vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

// Exercise the actual handlers with an in-memory journal fixture: no DB writes.
const read = file => readFileSync(file, 'utf8');
const evaluate = (file, bindings, exports) => {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(bindings), `${source}\nreturn {${exports}};`)(...Object.values(bindings));
};
const badRequest = message => Object.assign(new Error(message), { statusCode: 400 });
const { journalDateRange } = evaluate('server/utils/accountant/date-range.ts', { badRequest }, 'journalDateRange');
assert.equal(journalDateRange(), undefined);
assert.equal(journalDateRange('2026-10-01', '2026-10-02').lte.toISOString(), '2026-10-02T23:59:59.999Z');
for (const args of [['2026-02-30'], ['invalid'], ['2026-10-03', '2026-10-02']]) assert.throws(() => journalDateRange(...args));
const account = { id: 'cash', companyId: 'company', name: 'Cash', category: 'ASSET', accountType: 'CASH', isPrimary: true, isSystem: true };
const fixture = [
  ['opening', '2026-09-30T12:00:00Z', 'DEBIT', 100, 1],
  ['sale', '2026-10-01T12:00:00Z', 'DEBIT', 20, 2],
  ['payment', '2026-10-02T23:59:59.999Z', 'CREDIT', 5, 1],
  ['later', '2026-10-03T00:00:00Z', 'DEBIT', 90, 1],
].map(([id, date, side, amount, rate]) => ({ id, accountId: 'cash', side, amount, deletedAt: null, journal: { journalDate: new Date(date), exchangeRate: rate, status: 'PUBLISHED', deletedAt: null, currency: 'INR' } }));
fixture.push({ ...fixture[1], id: 'draft', journal: { ...fixture[1].journal, status: 'DRAFT' } });
fixture.push({ ...fixture[1], id: 'deleted', deletedAt: new Date() });
const matching = where => fixture.filter(l => {
  const d = where.journal?.journalDate;
  return l.deletedAt === null && l.journal.status === 'PUBLISHED' && l.journal.deletedAt === null &&
    (!where.accountId || where.accountId === l.accountId) && (!d?.gte || l.journal.journalDate >= d.gte) && (!d?.lte || l.journal.journalDate <= d.lte);
});
const prisma = {
  company: { findUnique: async () => ({ currency: 'INR' }) },
  accountingAccount: { createMany: async () => {}, findFirst: async () => account, findMany: async () => [account] },
  manualJournal: { findMany: async () => [] },
  manualJournalLine: {
    findMany: async args => matching(args.where).sort((a, b) => b.journal.journalDate - a.journal.journalDate).slice(args.skip || 0, (args.skip || 0) + (args.take || Infinity)),
    count: async args => matching(args.where).length,
  },
};
const { baseAmount, baseCurrencyTotals } = evaluate('server/utils/accountant/reporting.ts', { prisma, badRequest, balancedTotal() {} }, 'baseAmount,baseCurrencyTotals');
const routes = new Map();
const router = { use() {}, get(path, ...handlers) { routes.set(path, handlers.at(-1)); }, post() {}, patch() {}, delete() {} };
evaluate('server/utils/accountant/accounts.ts', { z, prisma, journalDateRange, baseAmount, baseCurrencyTotals, Router: () => router, asyncHandler: fn => fn, rbac: () => () => {}, requireAuth() {}, badRequest, notFound: badRequest, context() {}, logActivity() {}, assertAccountingDateUnlocked() {}, replaceSystemJournal() {}, voidSystemJournal() {}, cents() {} }, 'accountingAccountRouter');
const call = async (path, query) => { let result; await routes.get(path)({ user: { companyId: 'company' }, params: { id: 'cash' }, query }, { json(value) { result = value; } }); return result; };
const query = { from: '2026-10-01', to: '2026-10-02' };
assert.equal((await call('/', query)).data[0].balance, 35, 'Chart shows period movement in base currency');
const ledger = await call('/:id/ledger', query);
assert.equal(ledger.total, 2);
assert.equal(ledger.closingBalance, 135, 'Closing includes the prior opening, excludes later activity');
assert.deepEqual(ledger.data.map(l => [l.id, l.balance]), [['payment', 135], ['sale', 140]]);
const second = await call('/:id/ledger', { ...query, page: 2, pageSize: 1 });
assert.equal(second.data[0].balance, 140, 'Pagination retains the running balance');
assert.equal((await call('/', {})).data[0].balance, 225, 'Clearing dates restores all-time balances');
assert.equal((await call('/', { to: '2026-10-02' })).data[0].balance, 135);
assert.equal((await call('/', { from: '2026-10-01' })).data[0].balance, 125);
await assert.rejects(call('/:id/ledger', { from: '2026-10-03', to: '2026-10-02' }));

// Mount the real page setup and change its dates, as the inputs do.
const calls = [], notices = [];
Object.assign(globalThis, Vue, {
  useAccountantApi: () => ({ get: async (path, options) => { calls.push({ path, query: { ...options?.query } }); return path.endsWith('/ledger') ? { data: [], total: 0 } : { data: [account], baseCurrency: 'INR' }; } }),
  useRoute: () => ({ query: {} }), useToast: () => ({ add: message => notices.push(message) }),
});
const { descriptor } = parse(read('components/accountant/ChartOfAccountsPage.vue'));
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'ChartOfAccountsPage.vue', id: 'date-filter' }).errors, []);
const script = compileScript(descriptor, { id: 'date-filter' });
mkdirSync('.cache/accountant-pages', { recursive: true });
const file = resolve('.cache/accountant-pages/date-filter-test.mjs');
writeFileSync(file, ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const component = (await import(pathToFileURL(file).href)).default;
component.render = () => null;
const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {} });
const app = renderer.createApp(component);
const instance = app.mount({});
const state = instance.$.setupState;
const settle = async () => { for (let i = 0; i < 5; i++) { await Vue.nextTick(); await Promise.resolve(); } };
await settle(); calls.length = 0;
state.ledgerPage = 3; state.ledgerFrom = '2026-10-01'; state.ledgerTo = '2026-10-02'; await settle();
assert.equal(state.ledgerPage, 1);
assert.ok(calls.some(c => c.path === '/accounting-accounts' && c.query.from === query.from && c.query.to === query.to));
assert.ok(calls.some(c => c.path.endsWith('/cash/ledger') && c.query.page === 1 && c.query.to === query.to));
calls.length = 0; state.ledgerFrom = ''; state.ledgerTo = ''; await settle();
assert.ok(calls.some(c => c.path === '/accounting-accounts' && !c.query.from && !c.query.to));
assert.ok(calls.some(c => c.path.endsWith('/ledger') && !c.query.from && !c.query.to));
assert.deepEqual(notices, []);
app.unmount();
console.log('Account date filters passed: real handlers, inclusive dates, currency, carry-forward, pagination, page refresh and clearing.');
