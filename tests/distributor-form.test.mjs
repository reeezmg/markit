import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { z } from 'zod';
import ts from 'typescript';
import * as Vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const source = path => readFileSync(path, 'utf8');
function js(code) {
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.equal(output.diagnostics?.length || 0, 0);
  return output.outputText.replace(/^import .*\r?\n/gm, '').replace(/export default /g, 'return ').replace(/export /g, '');
}
function load(path, bindings, tail = '') { return new Function(...Object.keys(bindings), js(source(path)) + tail)(...Object.values(bindings)); }
const definitions = load('utils/account-defaults.ts', {}, '\nreturn {accountDefaultGroups,acceptsDefaultAccount}');
const createError = value => Object.assign(new Error(value.statusMessage), value);
const roleTypes = { payable: 'ACCOUNTS_PAYABLE', stock: 'STOCK', tax: 'OTHER_CURRENT_ASSET', cash: 'CASH', bank: 'BANK', opening: 'EQUITY' };
const accounts = Object.entries(roleTypes).map(([role, accountType]) => ({ id: role, accountType, isActive: true, companyId: 'branch', name: role }));
accounts.push({ id: 'supplier-cash', accountType: 'CASH', isActive: true, companyId: 'branch', name: 'Supplier cash' });
const defaults = Object.fromEntries(Object.keys(roleTypes).map(role => [role, role]));

function fixture({ enabled = false, role = 'admin', failImport = false } = {}) {
  let state = {
    profile: { id: 'supplier', name: 'Original', status: true, address: { id: 'same-address', city: 'Old city' } },
    link: { distributorId: 'supplier', companyId: 'branch', openingDue: 15, openingDueDate: null, distributorNumber: 8 },
    mappings: { cash: 'supplier-cash' }, enabled, number: 9, audits: [],
  };
  const calls = [];
  const member = () => ({ ...structuredClone(state.link), distributor: structuredClone(state.profile) });
  const db = {
    $queryRawUnsafe: async (sql, ...args) => {
      calls.push({ sql, args });
      if (sql.includes('UPDATE companies')) return [{ number: state.number++ }];
      if (sql.includes('FOR UPDATE')) return args[0] === 'branch' && args[1] === 'supplier' ? [{ distributor_id: 'supplier' }] : [];
      throw Error('Unexpected SQL ' + sql);
    },
    distributorCompany: {
      findUnique: async ({ where }) => where.distributorId_companyId.companyId === 'branch' && where.distributorId_companyId.distributorId === 'supplier' ? member() : null,
      update: async ({ data, where }) => { assert.equal(where.distributorId_companyId.companyId, 'branch'); state.link = { ...state.link, ...data }; calls.push('membership'); },
    },
    distributor: {
      create: async ({ data }) => {
        const { companies, address, ...profile } = data;
        state.profile = { ...profile, id: 'new', address: { id: 'new-address', ...address.create } };
        state.link = { ...companies.create, distributorId: 'new' }; calls.push('create'); return { ...state.profile };
      },
      update: async ({ where, data }) => { assert.equal(where.id, 'supplier'); state.profile = { ...state.profile, ...data }; calls.push('update'); return { ...state.profile }; },
    },
    address: { upsert: async ({ where, update }) => { assert.equal(where.distributorId, 'supplier'); state.profile.address = { ...state.profile.address, ...update }; calls.push('address'); } },
    accountantAccountingAccount: { findMany: async ({ where }) => { assert.deepEqual(where, { companyId: 'branch', isActive: true, deletedAt: null }); return accounts; } },
    accountantAudit: { findFirst: async () => ({ after: defaults }) },
    accountantDistributorMapping: { findMany: async ({ where }) => { assert.equal(where.companyId, 'branch'); return Object.entries(state.mappings).map(([role, accountId]) => ({ role, accountId })); } },
    accountantDistributorSettings: { findUnique: async () => ({ enabled: state.enabled, contactId: 'contact' }) },
    accountantContact: { updateMany: async ({ where, data }) => { assert.equal(where.companyId, 'branch'); calls.push({ contact: data }); } },
  };
  const bindings = { ...definitions, z, createError, context: () => ({ db, companyId: 'branch', userId: 'admin', role }),
    configureDistributorAccounting: async (id, mappings) => { calls.push('configure'); state.mappings = structuredClone(mappings); },
    importDistributorAccounting: async (id, mappings) => {
      calls.push('import'); state.mappings = structuredClone(mappings); state.enabled = true;
      if (failImport) throw Error('Reconciliation failed');
    },
    logActivity: async input => { state.audits.push(input); },
  };
  const api = load('server/utils/distributor-form.ts', bindings, '\nreturn {loadDistributorForm,saveDistributorForm}');
  async function transaction(fn) {
    const backup = structuredClone(state);
    try { return await fn(); } catch (error) { state = backup; throw error; }
  }
  return { api, calls, transaction, get state() { return state; } };
}
const body = { name: 'Updated', status: true, street: 'Main road', city: 'New city', phoneNo: '12345', openingDue: 20, openingDueDate: '2026-10-01', accountingAccounts: defaults };

test('opening create/edit forms loads defaults without writes and keeps supplier overrides', async () => {
  const f = fixture();
  const fresh = await f.api.loadDistributorForm();
  assert.deepEqual(fresh.mappings, defaults);
  assert.equal(fresh.distributor, null);
  const edited = await f.api.loadDistributorForm('supplier');
  assert.equal(edited.mappings.cash, 'supplier-cash');
  assert.equal(edited.openingDue, 15);
  assert.equal(edited.distributor.address.id, 'same-address');
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.api.loadDistributorForm('foreign'), { statusCode: 404 });
});

test('new supplier Save numbers the record and enables accounting with the chosen defaults', async () => {
  const f = fixture();
  const saved = await f.transaction(() => f.api.saveDistributorForm(body));
  assert.equal(saved.id, 'new');
  assert.equal(f.state.link.distributorNumber, 9);
  assert.equal(f.state.link.companyId, 'branch');
  assert.deepEqual(f.state.mappings, defaults);
  assert.equal(f.state.enabled, true);
  assert.ok(f.calls.includes('import'));
  assert.equal(f.state.audits.length, 1);
});

test('edit preserves address identity and existing accounting connection without importing history again', async () => {
  const f = fixture({ enabled: true });
  await f.transaction(() => f.api.saveDistributorForm({ ...body, id: 'supplier', accountingAccounts: { ...defaults, cash: 'supplier-cash' } }));
  assert.equal(f.state.profile.address.id, 'same-address');
  assert.equal(f.state.profile.address.city, 'New city');
  assert.equal(f.state.link.distributorNumber, 8);
  assert.equal(f.state.mappings.cash, 'supplier-cash');
  assert.ok(f.calls.includes('configure'));
  assert.ok(!f.calls.includes('import'));
  assert.equal(f.state.audits[0].meta.before.distributor.name, 'Original');
  assert.equal(f.state.audits[0].meta.before.distributor.address.id, 'same-address');
});

test('connecting an existing supplier and failures are atomic with its profile and opening balance', async () => {
  const ok = fixture();
  await ok.transaction(() => ok.api.saveDistributorForm({ ...body, id: 'supplier' }));
  assert.equal(ok.state.enabled, true);
  const f = fixture({ failImport: true });
  const before = structuredClone(f.state);
  await assert.rejects(f.transaction(() => f.api.saveDistributorForm({ ...body, id: 'supplier' })), /Reconciliation failed/);
  assert.deepEqual(f.state, before);
});

test('invalid accounts, dates, names and cross-company IDs reject before supplier writes', async () => {
  for (const invalid of [{ ...body, name: ' ' }, { ...body, openingDueDate: '2026-02-30' },
    { ...body, openingDue: 2.333 }, { ...body, id: 'foreign' },
    { ...body, accountingAccounts: { ...defaults, cash: 'foreign' } },
    { ...body, accountingAccounts: { ...defaults, bank: 'cash' } }, { ...body, accountingAccounts: undefined }]) {
    const f = fixture();
    await assert.rejects(f.api.saveDistributorForm(invalid));
    assert.ok(!f.calls.includes('create') && !f.calls.includes('update'));
  }
  const staff = fixture({ role: 'biller' });
  assert.equal((await staff.api.loadDistributorForm('supplier')).canManageAccounts, false);
  await assert.rejects(staff.api.saveDistributorForm(body), { statusCode: 403 });
  await staff.transaction(() => staff.api.saveDistributorForm({ ...body, accountingAccounts: undefined }));
  assert.ok(!staff.calls.includes('configure') && !staff.calls.includes('import'));
});

async function formFixture({ edit = false, failLoad = false, failSave = false } = {}) {
  const calls = [], emitted = [], toasts = [];
  const props = Vue.reactive({ selectedSupplier: edit ? { id: 'supplier' } : null, companyId: 'branch' });
  const scope = { ready: Promise.resolve(), companyId: Vue.ref('branch'), beginForm: async () => {}, selectOwner: async id => { scope.companyId.value = id; },
    fetch: async (url, options = {}) => {
      calls.push({ url, ...options });
      if (url.endsWith('/form')) {
        if (failLoad) throw Error('Network failed');
        return { canManageAccounts: true, accounts, mappings: edit ? { ...defaults, cash: 'supplier-cash' } : defaults,
          distributor: edit ? { id: 'supplier', name: 'Existing', address: { city: 'Town' } } : null, openingDue: 10 };
      }
      if (failSave) throw Error('Save failed');
      return { distributor: { id: 'supplier', name: 'Saved' } };
    },
  };
  const bindings = { ...Vue, ...definitions, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args),
    useCompanyScope: () => scope, useToast: () => ({ add: t => toasts.push(t) }), useModelCache: () => ({ invalidateModels: async () => {} }), onBeforeUnmount() {} };
  const code = parse(source('components/Distributor/Form.vue')).descriptor.scriptSetup.content;
  const api = new Function(...Object.keys(bindings), js(code) + '\nreturn {supplier,accountingAccounts,submitForm,loading,error,loadForm}')(...Object.values(bindings));
  await Vue.nextTick(); await new Promise(r => setTimeout(r, 5));
  return { api, calls, emitted, toasts };
}

test('form prefills company defaults on create, retains supplier accounts on edit, and sends one atomic Save', async () => {
  for (const edit of [false, true]) {
    const f = await formFixture({ edit });
    assert.equal(f.api.accountingAccounts.value.cash, edit ? 'supplier-cash' : 'cash');
    f.api.supplier.value.name = 'Saved';
    await f.api.submitForm();
    const saves = f.calls.filter(c => c.url.endsWith('/save'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].body.accountingAccounts.cash, edit ? 'supplier-cash' : 'cash');
    assert.ok(f.emitted.some(e => e[0] === 'saved'));
  }
});

test('load failures block Save and failed saves preserve the complete form for retry', async () => {
  const loading = await formFixture({ failLoad: true });
  await loading.api.submitForm();
  assert.ok(!loading.calls.some(c => c.url.endsWith('/save')));
  const f = await formFixture({ edit: true, failSave: true });
  f.api.supplier.value.name = 'Keep draft';
  await f.api.submitForm();
  assert.equal(f.api.supplier.value.name, 'Keep draft');
  assert.equal(f.api.accountingAccounts.value.cash, 'supplier-cash');
  assert.ok(!f.emitted.some(e => e[0] === 'saved'));
  assert.ok(f.toasts.some(t => t.color === 'red'));
});

test('form routes use the authorized company, read-only loads and one locked save transaction', async () => {
  const transactions = [];
  const bindings = { createError, ZodError: z.ZodError, defineEventHandler: handler => handler,
    useCompanyRequestSession: async () => ({ data: { companyId: 'branch', id: 'admin', role: 'admin' } }),
    runAccountant: async (identity, run, options) => { transactions.push({ identity, options }); return run(); },
    getQuery: event => event.query || {}, readBody: async event => event.body,
    loadDistributorForm: async id => ({ id }), saveDistributorForm: async body => ({ success: true, name: body.name }),
  };
  const get = load('server/api/distributor/form.get.ts', bindings);
  assert.deepEqual(await get({ query: { id: 'supplier' } }), { id: 'supplier' });
  assert.equal(transactions[0].options.readOnly, true);
  await assert.rejects(get({ query: { id: ['supplier'] } }), { statusCode: 400 });
  const save = load('server/api/distributor/save.post.ts', bindings);
  await save({ body: { name: 'Saved' } });
  assert.deepEqual(transactions[1].identity, { companyId: 'branch', userId: 'admin', role: 'admin' });
  assert.equal(transactions[1].options.lockCompany, true);
  assert.equal(transactions[1].options.transactionTimeoutMs, 120000);
});

test('changed Vue scripts/templates and server files compile; both entry points use the full-page form', () => {
  for (const path of ['components/Distributor/Form.vue', 'components/Distributor/AccountSelection.vue', 'components/AddProduct/TopBar.vue', 'pages/distributor/index.vue']) {
    const { descriptor, errors } = parse(source(path), { filename: path }); assert.deepEqual(errors, []);
    const script = compileScript(descriptor, { id: path }); js(script.content);
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, id: path, filename: path, compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
  }
  for (const path of ['server/utils/distributor-form.ts', 'server/api/distributor/form.get.ts', 'server/api/distributor/save.post.ts']) js(source(path));
  assert.match(source('pages/distributor/index.vue'), /v-model="openModal" fullscreen/);
  assert.match(source('components/AddProduct/TopBar.vue'), /v-model="isDistributorOpen" fullscreen/);
  assert.ok(!source('components/Distributor/Form.vue').includes('/api/counter/increment'));
});
