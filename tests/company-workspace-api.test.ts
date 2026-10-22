import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { createError, getHeader, getQuery, getRequestURL, createEvent } from 'h3';
import { Readable } from 'node:stream';

function load(file: string, bindings: Record<string, any>, exports: string) {
  const source = readFileSync(file, 'utf8').replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm, '')
    .replace(/export default /g, 'const handler = ').replace(/export (async )?function /g, '$1function ');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), js + ';return {' + exports + '};')(...Object.values(bindings));
}
function fixture(companyId = 'head', role = 'admin') {
  const session = { data: { id: 'user', companyId, role, billPrefix: 'HEAD' } };
  const bindings = { createError, getHeader, getQuery, getRequestURL, requireAuthSession: async () => session,
    getHeadOfficeAdmin: async (_: string, id: string) => id === 'head' && role === 'admin',
    getAllStoreIds: async () => ['head', 'branch'],
    normalizeBillingUnits: (v: any) => v, normalizeSizeLabels: (v: any) => v,
    loadSelectedAccounts: async (id: string) => ({ companyId: id }),
    prisma: { company: { findUniqueOrThrow: async ({ where }: any) => ({ id: where.id, name: where.id, type: 'seller', billPrefix: 'BRANCH' }) },
      expenseCategory: { findFirst: async () => null } } };
  const scope = load('server/utils/companyRequestScope.ts', bindings, 'useCompanyRequestSession');
  const event = (target: string) => {
    const req = Readable.from([]) as any;
    req.method = 'GET'; req.url = '/api/example'; req.headers = { 'x-company-id': target };
    return createEvent(req, {} as any);
  };
  return { session, scope: scope.useCompanyRequestSession, event };
}

test('server scope loads branch settings while preserving the authenticated head-office data', async () => {
  const f = fixture(); const before = JSON.stringify(f.session);
  const scoped = await f.scope(f.event('branch'));
  assert.equal(scoped.data.companyId, 'branch'); assert.equal(scoped.data.billPrefix, 'BRANCH');
  assert.equal(JSON.stringify(f.session), before);
});

test('an already logged-in branch reads current settings instead of its old cookie snapshot', async () => {
  const f = fixture('branch'); const before = JSON.stringify(f.session);
  const scoped = await f.scope(f.event('branch'));
  assert.equal(scoped.data.billPrefix, 'BRANCH');
  assert.equal(f.session.data.billPrefix, 'HEAD');
  assert.equal(JSON.stringify(f.session), before, 'Refreshing request settings does not rewrite the session');
});

test('Accountant defaults read the branch page context without a session-write request', async () => {
  const actualAuth = { session: { value: { companyId: 'head', selectedAccounts: { companyId: 'head', defaults: { cash: 'old-head' } } } } };
  const scope = { ready: Promise.resolve(), companyId: { value: 'branch' },
    auth: { session: { value: { selectedAccounts: { companyId: 'branch', defaults: { cash: 'current-branch' } } } } },
    fetch: async () => { throw new Error('Unexpected cookie-writing fallback'); } };
  const { useSelectedAccounts } = load('composables/useSelectedAccounts.ts', {
    useCompanyScope: () => scope, useNuxtApp: () => ({ $auth: actualAuth }),
  }, 'useSelectedAccounts');
  const accounts = await useSelectedAccounts().get();
  assert.deepEqual(accounts.defaults, { cash: 'current-branch' });
  accounts.defaults.cash = 'edited';
  assert.equal(scope.auth.session.value.selectedAccounts.defaults.cash, 'current-branch', 'Form drafts do not mutate the saved snapshot');
  assert.equal(actualAuth.session.value.companyId, 'head');
});

test('saving branch account defaults refreshes its local context without updating the head session', async () => {
  const calls: any[] = [];
  const auth = { session: { value: { companyId: 'head' } }, updateSession: async () => calls.push('cookie') };
  const scope = { companyId: { value: 'branch' }, fetch: async (_: any, options: any) => {
    calls.push(options.body.companyId); return { defaults: { cash: 'new-branch' } };
  }, refreshSettings: async () => calls.push('local-branch') };
  const { useSelectedAccounts } = load('composables/useSelectedAccounts.ts', {
    useCompanyScope: () => scope, useNuxtApp: () => ({ $auth: auth }),
  }, 'useSelectedAccounts');
  assert.deepEqual(await useSelectedAccounts().refresh(), { defaults: { cash: 'new-branch' } });
  assert.deepEqual(calls, ['branch', 'local-branch']);
});

for (const [company, role, target] of [['head', 'admin', 'foreign'], ['head', 'manager', 'branch'], ['branch', 'admin', 'head']])
  test(`${company}/${role} cannot request unauthorized ${target} scope`, async () => {
    const f = fixture(company, role);
    await assert.rejects(f.scope(f.event(target)), { statusCode: 403 });
  });

test('product dimension reads and shipping preferences use the authorized branch rather than the login company', async () => {
  const f = fixture(), seen: any[] = [];
  const common = { useCompanyRequestSession: f.scope, defineEventHandler: (fn: any) => fn, createError };
  const dimensions = load('server/api/product-inputs.get.ts', { ...common,
    pool: { query: async (_: string, args: any[]) => { seen.push(args); return { rows: [{ productDimension: true, sizeDimension: false }] }; } },
  }, 'handler').handler;
  assert.deepEqual(await dimensions(f.event('branch')), { productDimension: true, sizeDimension: false });
  assert.deepEqual(seen, [['branch']]);
  const proxy = load('server/utils/shipping-proxy.ts', { ...common,
    useRuntimeConfig: () => ({ shippingServiceUrl: 'https://shipping.invalid', shippingServiceToken: 'test-only' }),
    $fetch: async (url: string, options: any) => { seen.push({ url, method: options.method }); return { size: '4R' }; },
  }, 'shippingProxy').shippingProxy;
  assert.deepEqual(await proxy(f.event('branch'), { method: 'GET', path: 'label-size' }), { size: '4R' });
  assert.deepEqual(seen.at(-1), { url: 'https://shipping.invalid/api/seller/branch/shipping/label-size', method: 'GET' });
  const count = seen.length;
  await assert.rejects(proxy(f.event('foreign'), { method: 'POST', path: 'label-size', body: { size: 'A4' } }), { statusCode: 403 });
  assert.equal(seen.length, count, 'Rejected scope never reaches the upstream service');
  assert.equal(f.session.data.companyId, 'head');
});
