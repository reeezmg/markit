import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { createError } from 'h3';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';

// Execute the real middleware with in-memory membership/session dependencies.
function setup(overrides: Record<string, any> = {}) {
  const data = { id: 'admin', companyId: 'company', allStores: true, ...overrides.session };
  const updates: any[] = [];
  const membership = { role: 'admin', status: true, deleted: false, delegatedHeadOfficeId: null,
    company: { status: true }, ...overrides.membership };
  const bindings = {
    defineEventHandler: (fn: any) => fn,
    getRequestURL: () => new URL(`http://localhost${overrides.path || '/api/accountant/accounts'}`),
    useAuthSession: async () => ({ data, update: async (patch: any) => { updates.push(patch); Object.assign(data, patch); } }),
    getHeadOfficeAdmin: async () => overrides.headOffice || null,
    prisma: {
      companyUser: { findUnique: async (query: any) => {
        assert.deepEqual(query.where.companyId_userId, { companyId: 'company', userId: 'admin' });
        return overrides.missing ? null : membership;
      } },
      company: { findUnique: async () => overrides.branch || null },
    },
    createError,
  };
  const source = readFileSync('server/middleware/organization-access.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm, '')
    .replace('export default', 'return');
  const handler = new Function(...Object.keys(bindings), js)(...Object.values(bindings));
  return { handler, data, updates };
}

for (const path of ['/api/accountant/accounts', '/api/organization/context?companyId=company']) {
  test(`stale All Stores allows a verified direct admin: ${path}`, async () => {
    const { handler, data, updates } = setup({ path, session: { organizationHeadOfficeId: 'old', readCompanyId: 'branch' } });
    await handler({});
    assert.equal(data.allStores, false);
    assert.equal(data.companyId, 'company');
    assert.equal(data.organizationHeadOfficeId, undefined);
    assert.equal(data.readCompanyId, undefined);
    assert.equal(updates.length, 1);
  });
}

for (const overrides of [{ missing: true }, { membership: { status: false } },
  { membership: { deleted: true } }, { membership: { role: 'accountant' } },
  { membership: { company: { status: false } } }, { membership: { delegatedHeadOfficeId: 'head' } }]) {
  test(`stale All Stores cannot recover revoked or delegated admin access: ${JSON.stringify(overrides)}`, async () => {
    const { handler, updates } = setup(overrides);
    await assert.rejects(handler({}), { statusCode: 403 });
    assert.equal(updates.length, 0);
  });
}

test('current head-office admin keeps All Stores', async () => {
  const { handler, updates } = setup({ headOffice: { role: 'admin' } });
  await handler({});
  assert.equal(updates.length, 0);
});

for (const overrides of [{}, { headOffice: { role: 'admin' }, branch: { status: false, parentCompanyId: 'head' } },
  { headOffice: { role: 'admin' }, branch: { status: true, parentCompanyId: 'different' } }]) {
  test(`invalid delegated branch remains denied: ${JSON.stringify(overrides)}`, async () => {
    const { handler, updates } = setup({ ...overrides, session: { delegatedHeadOfficeId: 'head', allStores: false } });
    await assert.rejects(handler({}), { statusCode: 403 });
    assert.equal(updates.length, 0);
  });
}

test('valid delegated branch remains accessible', async () => {
  const { handler } = setup({ session: { delegatedHeadOfficeId: 'head', allStores: false },
    headOffice: { role: 'admin' }, branch: { status: true, parentCompanyId: 'head' } });
  await handler({});
});

test('eager context rejection is observed even before a caller awaits readiness', async () => {
  const failure = createError({ statusCode: 403, statusMessage: 'Company access denied' });
  const source = readFileSync('composables/useCompanyScope.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm, '')
    .replace(/export (async )?function /g, '$1function ');
  const bindings = { ...Vue,
    useRoute: () => ({ path: '/accountant/accounts', params: {}, query: {} }),
    useNuxtApp: () => ({ $auth: { session: Vue.ref({ companyId: 'company', role: 'admin' }) } }),
    useRequestFetch: () => async () => { throw failure; },
    useFetch: () => ({ data: Vue.ref([]) }),
  };
  const useCompanyScope = new Function(...Object.keys(bindings), js + ';return useCompanyScope;')(...Object.values(bindings));
  let scope: any;
  const app = Vue.createSSRApp({ setup() {
    scope = useCompanyScope();
    return () => Vue.h('p', 'fixture');
  } });
  await renderToString(app);
  // Node's test runner fails on an unhandled rejection across this event-loop turn.
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(scope.ready, error => error === failure);
});
