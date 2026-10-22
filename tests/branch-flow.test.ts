import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as vue from 'vue';
import { createApp, createError, defineEventHandler, getRequestURL, setResponseHeader, toWebHandler, readBody } from 'h3';
import { appendCompanyWhere } from '../utils/companyWhere';
import { companySwitchLocation } from '../utils/companySwitchLocation';
import { Prisma } from '@prisma/client';
import { parse } from '@vue/compiler-sfc';
import { z } from 'zod';
import { QueryClient } from '@tanstack/vue-query';
import { QueryObserver } from '@tanstack/query-core';
import { activePageQueryState, nuxtPageDataState, vuePageMounted, requestBelongsToDocument, hasCompanyRestriction } from './helpers/page-query-state';
import { staticPageRedirect } from './helpers/page-redirects';

// Execute production handlers/composables with in-memory dependencies. No DB writes or DDL.
function load(file: string, bindings: Record<string, unknown>, exports = ''): any {
  const source = readFileSync(file, 'utf8');
  const js = ts.transpileModule(file.endsWith('.vue') ? parse(source).descriptor.scriptSetup!.content : source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm, '')
    .replace(/export default /g, 'return ').replace(/export (async )?function /g, '$1function ').replace(/export (const|let) /g, '$1 ');
  return new Function(...Object.keys(bindings), js + (exports ? `;return {${exports}};` : ''))(...Object.values(bindings));
}
const session = () => ({ companyId: 'head', id: 'admin', email: 'admin@example.invalid', role: 'admin' });

test('company writes allow policy checks beyond five seconds inside a bounded serializable transaction', async () => {
  const { scopeOrganizationModelReads } = load('server/utils/organizationModelScope.ts', {
    Prisma, createError, appendCompanyWhere, prisma: {}, prepareItemStockWrite: () => {},
  }, 'scopeOrganizationModelReads');
  let committed = false;
  const db: any = { collection: { create: async ({data}: any) => { committed = true; return data; } } };
  db.$transaction = async (run: any, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    if ((options.timeout ?? 5000) < 5630) throw Object.assign(new Error('Interactive transaction expired during policy checks'), {code:'P2028'});
    assert.ok(options.timeout <= 30000, 'Writes retain a bounded transaction deadline');
    assert.ok(options.maxWait > 0 && options.maxWait <= 15000, 'Connection wait is bounded');
    return run(db);
  };
  const scoped = scopeOrganizationModelReads(db, 'head', ['head','branch']);
  const created = await scoped.collection.create({data:{name:'Fixture collection',companyId:'branch'}});
  assert.equal(created.companyId,'branch');assert.equal(committed,true);
});

test('notification mark-all ignores responses from a previously selected company', async () => {
  const auth = { session: vue.ref({ companyId: 'head', id: 'sender' }) };
  let resolveRequest!: (value: any) => void;
  let deferred = true;
  const { useNotifications } = load(process.env.NOTIFICATIONS_COMPOSABLE_SOURCE || 'composables/useNotifications.ts', {
    ref: vue.ref, computed: vue.computed, watch: vue.watch, onMounted: () => {}, onUnmounted: () => {},
    useNuxtApp: () => ({ $auth: auth }), NOTIFICATION_TYPES: ['BILL_CREATED'],
    $fetch: async () => deferred ? new Promise(resolve => { resolveRequest = resolve; }) : { success: true },
  }, 'useNotifications');
  const scope = vue.effectScope();
  const notifications = scope.run(() => useNotifications());
  try {
    const pending = notifications.markAllAsRead();
    auth.session.value = { companyId: 'branch', id: 'sender' };
    await vue.nextTick();
    notifications.notifications.value = [{ id: 'branch-notice', companyId: 'branch', read: false }];
    resolveRequest({ success: true });
    const result = await pending;
    assert.equal(notifications.notifications.value[0].read, false, 'Branch notifications stay unread');
    assert.equal(result, false, 'A response for the previous company is not a current-company success');
    deferred = false;
    assert.equal(await notifications.markAllAsRead(), true);
    assert.equal(notifications.notifications.value[0].read, true, 'A current-company success updates its own list');
  } finally { scope.stop(); }
});

test('bill creation uses source DML without installing or requiring a stored function', () => {
  const handler = readFileSync('server/api/bill/create.post.ts', 'utf8');
  const service = readFileSync('server/utils/create-bill-source.ts', 'utf8');
  assert.match(handler, /return createBillSource\(client, body\)/);
  assert.doesNotMatch(handler + service, /create_bill_source_plpgsql|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|FUNCTION|INDEX|TRIGGER)\b/i);
  assert.match(handler, /saveSourceRequest/);
  assert.match(handler, /lockCompanyRequest/);
  assert.match(service, /applyBillStock\(db, billId, companyId, true\)/);
});

test('switching stores replaces account defaults and all company presentation fields', async () => {
  const data: any = { ...session(), category: ['old'], isLite: true,
    selectedAccounts: { companyId: 'head' }, selectedAccountsPacked: 'old-head-defaults' };
  const company: any = { id: 'branch', name: 'Branch', type: 'seller', status: true, plan: 'pro',
    parentCompanyId: 'head', category: ['new'], pipeline: { id: 'branch-pipeline' }, variantinput: {}, productinput: {} };
  const membership = { company, role: 'admin', status: true, deleted: false, name: 'Admin', code: 2 };
  const handler = load('auth/server/api/auth/switch-company.post.ts', {
    eventHandler: (fn: any) => fn, requireAuthSession: async () => ({ data, update: async (patch: any) => Object.assign(data, patch) }),
    readBody: async () => ({ companyId: 'branch' }), createError,
    prisma: { companyUser: { findUnique: async () => membership }, expenseCategory: { findFirst: async () => ({ id: 'branch-purchase' }) } },
    getHeadOfficeAdmin: async () => ({ name: 'Admin' }), ensureHeadOfficeBranchMemberships: async () => {},
    loadSelectedAccounts: async (companyId: string) => ({ companyId }), packSelectedAccounts: (value: any) => value.companyId,
    normalizeBillingUnits: () => [], normalizeSizeLabels: () => [],
  });
  await handler({});
  assert.equal(data.companyId, 'branch');
  assert.equal(data.selectedAccountsPacked, 'branch');
  assert.equal(data.selectedAccounts, undefined);
  assert.deepEqual(data.category, ['new']);
  assert.equal(data.isLite, false);
});

test('single-company downloads honor and authorize URL company selection', async () => {
  const { getReadCompanyId } = load('server/utils/organizationReadScope.ts', {
    createError, requireAuthSession: async () => ({ data: session() }),
    authorizedCompanyIds: async () => ['head', 'branch'],
    assertCompanyAccess: async (_: unknown, id: string) => { if (!['head', 'branch'].includes(id)) throw createError({ statusCode: 403 }); return id; },
    getHeader: (event: any, key: string) => event.headers?.[key], getQuery: (event: any) => event.query ?? {},
  }, 'getReadCompanyId');
  assert.equal(await getReadCompanyId({ query: { companyId: 'branch' } }), 'branch');
  await assert.rejects(getReadCompanyId({ query: { companyId: 'outside' } }), (e: any) => e.statusCode === 403);
});

test('request middleware retains body scope and rejects conflicting URL/header company', async () => {
  const handler = load('server/middleware/company-request.ts', {
    defineEventHandler: (fn: any) => fn, createError, prisma: {}, requireAuthSession: async () => ({ data: session() }),
    getRequestURL: (event: any) => new URL(event.path, 'https://local.invalid'), getQuery: (event: any) => event.query ?? {},
    getHeader: (event: any, key: string) => event.headers?.[key], readBody: async (event: any) => event.body,
    assertCompanyAccess: async (_: unknown, id: string) => { if (!['head', 'branch'].includes(id)) throw createError({ statusCode: 403 }); return id; },
  });
  const event: any = { path: '/api/products/create', method: 'POST', context: {}, body: { companyId: 'branch' } };
  await handler(event);
  assert.equal(event.context.requestCompanyId, 'branch');
  await assert.rejects(handler({ path: '/api/bill/findManyCategory', method: 'GET', context: {},
    headers: { 'x-company-id': 'head' }, query: { companyId: 'outside' } }), (e: any) => e.statusCode === 403);
});

test('company form context does not inherit another store account defaults', async () => {
  const actualAuth = { session: vue.ref({ ...session(), selectedAccounts: { companyId: 'head' } }) };
  const component = {};
  const { useCompanyScope } = load('composables/useCompanyScope.ts', {
    ...vue, inject: () => null, provide: () => {}, getCurrentInstance: () => component, appendCompanyWhere,
    useRoute: () => ({ path: '/erp/billing', params: {}, query: {} }), useNuxtApp: () => ({ $auth: actualAuth }),
    useRequestFetch: () => async (_: unknown, options: any) => ({ companyId: options.query.companyId, selectedAccounts: { companyId: options.query.companyId } }),
    useFetch: () => ({ data: vue.ref([{ id: 'head', name: 'Head', isHeadOffice: true }, { id: 'branch', parentCompanyId: 'head' }]) }),
  }, 'useCompanyScope');
  const scope = useCompanyScope('form');
  await scope.selectCompany('branch');
  assert.equal(scope.auth.session.value.companyId, 'branch');
  assert.equal(scope.auth.session.value.selectedAccounts.companyId, 'branch');
  assert.equal(actualAuth.session.value.companyId, 'head');
  assert.equal(actualAuth.session.value.selectedAccounts.companyId, 'head');
});

test('record routes and company-specific queries do not survive a sidebar company switch', () => {
  for (const [from, to] of [
    ['/products/edit/old?entryCompany=head', '/products'],
    ['/products/brands/edit/old', '/products/brands'],
    ['/erp/edit/old', '/erp/sales'], ['/erp/online/old', '/erp/online'],
    ['/users/salary/cycle/old', '/users/salary'], ['/saleshistory/old', '/saleshistory'],
    ['/distributor/edit-purchase-return/old', '/distributor/purchase-return'],
    ['/accountant/manual-journals/old/edit', '/accountant/manual-journals'],
    ['/investments/investors/old', '/investments/investors'],
    ['/receipt/old', '/dashboard'], ['/statement/old', '/dashboard'],
    ['/order/pack?order=old', '/order/ecomorders'],
    ['/products/add?poId=old&entryCompany=head', '/products/add'],
    ['/accountant/chart-of-accounts?entryCompany=head&account=old', '/accountant/chart-of-accounts'],
    ['/reports/daily?from=2026-10-01&entryCompany=head', '/reports/daily?from=2026-10-01'],
  ]) assert.equal(companySwitchLocation(from), to, from);
});

test('model API scopes reads, child rows and writes across every company-owned model', async () => {
  const { scopeOrganizationModelReads } = load('server/utils/organizationModelScope.ts', {
    Prisma, createError, appendCompanyWhere, prisma: {}, prepareItemStockWrite: () => {},
  }, 'scopeOrganizationModelReads');
  const calls: any[] = [];
  const db: any = { $transaction: async (run: any) => run(db) };
  const owned = Prisma.dmmf.datamodel.models.filter(m => m.fields.some(f => f.name === 'companyId'));
  for (const model of owned) {
    const key = model.name[0].toLowerCase() + model.name.slice(1);
    db[key] = { findMany: async (args: any) => { calls.push({ model: model.name, args }); return []; },
      findUnique: async ({ where }: any) => ({ companyId: where.id === 'outside' ? 'outside' : 'head' }),
      update: async () => { throw new Error('Unexpected write'); } };
  }
  db.purchaseReturnItem = { findMany: async (args: any) => { calls.push({ model: 'PurchaseReturnItem', args }); return []; } };
  db.billHistory = { findMany: async (args: any) => { calls.push({ model: 'BillHistory', args }); return []; }, create: async () => { throw new Error('Unexpected audit write'); } };
  const scoped = scopeOrganizationModelReads(db, 'head', ['head', 'branch']);
  for (const model of owned) {
    const key = model.name[0].toLowerCase() + model.name.slice(1);
    await scoped[key].findMany({ where: { companyId: 'branch' } });
    const query = calls.at(-1).args.where;
    assert.equal(query.companyId, 'branch', model.name + ': explicit filter retained');
    assert.deepEqual(query.AND.at(-1), { companyId: { in: ['head', 'branch'] } }, model.name + ': authorization cap');
  }
  await scoped.purchaseReturnItem.findMany({});
  assert.deepEqual(calls.at(-1).args.where.AND.at(-1), { purchaseReturn: { companyId: { in: ['head', 'branch'] } } });
  await scoped.billHistory.findMany({});
  assert.deepEqual(calls.at(-1).args.where.AND.at(-1), { bill: { companyId: { in: ['head', 'branch'] } } });
  await assert.rejects(scoped.billHistory.create({ data: { billId: 'outside' } }), /history is read-only/);
  await assert.rejects(scoped.product.update({ where: { id: 'outside' }, data: { name: 'Denied' } }), /another company/);
  await assert.rejects(scoped.product.update({ where: { id: 'inside' }, data: { companyId: 'branch' } }), /transfer/);
  await assert.rejects(scoped.product.update({ where: { id: 'inside' }, data: { company: { update: { isHeadOffice: true } } } }), /Company & Branches/);
  db.category.findUnique = async () => ({ companyId: 'branch' });
  await assert.rejects(scoped.product.update({ where: { id: 'inside' }, data: { categoryId: 'branch-category' } }), /another company/);
  const branch = scopeOrganizationModelReads(db, 'branch', ['branch']);
  await branch.product.findMany({});
  assert.deepEqual(calls.at(-1).args.where.AND.at(-1), { companyId: { in: ['branch'] } });
  console.log(`Company authorization tested for ${owned.length} models, plus parent-owned detail rows.`);
});

test('coupon generation cannot read or issue another company coupon', async () => {
  let query: any, writes: any[] = [];
  let companyId = 'branch';
  const handler = load('server/api/coupons/generate.post.ts', {
    defineEventHandler: (fn: any) => fn, createError, readBody: async () => ({ clientId: 'client', grandTotal: 100, companyId }),
    useCompanyRequestSession: async () => ({ data: { companyId: 'branch' } }),
    prisma: { companyClient: { findUnique: async () => ({ clientId: 'client', companyId: 'branch' }) },
      coupon: { findMany: async (args: any) => { query = args; return []; } },
      couponClient: { createMany: async (args: any) => { writes.push(args); } } },
  });
  await handler({});
  assert.equal(query.where.companyId, 'branch');
  assert.equal(query.include.clients.select.usageLimit, true);
  assert.equal(writes.length, 0);
  companyId = 'outside';
  await assert.rejects(handler({}), (error: any) => error.statusCode === 403);
});

test('dashboard uses item stock totals and tolerates deleted variants', async () => {
  const stock = vue.ref([{ variantId: 'available', qty: 6 }, { variantId: 'available', qty: 3 }, { variantId: 'low', qty: 2 }]);
  const result = (rows: unknown[]) => ({ data: vue.ref(rows), refetch: async () => {} });
  const { useCompanyDashboard } = load('lib/api/useDashboardData.ts', {
    ...vue,
    useCompanyScope: () => ({ auth: { session: vue.ref({ companyId: 'branch' }) } }),
    useFindUniqueCompany: () => result([]), useFindManyProduct: () => result([]),
    useFindManyItem: () => ({ data: stock, refetch: async () => {} }),
    useFindManyBill: () => result([]), useFindManyExpense: () => result([]),
    useFindManyVariant: () => result([{ id: 'available', name: 'Available' }, { id: 'low', name: 'Low' }]),
    useFindManyEntry: () => result([{ variant: null, qty: 2, category: null, bill: { createdAt: 'invalid' }, value: 10 }]),
  }, 'useCompanyDashboard');
  const dashboard = useCompanyDashboard();
  assert.deepEqual(dashboard.lowStockEntries.value.map((row: any) => [row.id, row.qty]), [['low', 2]]);
  assert.deepEqual(dashboard.topProducts.value, [{ name: 'Unknown', total: 2 }]);
  assert.deepEqual(dashboard.categorySales.value, []);
  stock.value = [{ variantId: 'available', qty: 9 }, { variantId: 'low', qty: 8 }];
  await vue.nextTick();
  assert.deepEqual(dashboard.lowStockEntries.value, []);
});

test('coupon generation respects stored per-client allowances', async () => {
  let written: any[] = [];
  const handler = load('server/api/coupons/generate.post.ts', {
    defineEventHandler: (fn: any) => fn, createError,
    readBody: async () => ({ clientId: 'client', grandTotal: 100 }),
    useCompanyRequestSession: async () => ({ data: { companyId: 'branch' } }),
    prisma: { companyClient: { findUnique: async () => ({ clientId: 'client', companyId: 'branch' }) },
      coupon: { findMany: async (args: any) => [{ id: 'coupon', minBillAmount: 50, perClientLimit: 5, timesUsed: 0,
        clients: [{ clientId: 'client', ...(args.include.clients.select.usageLimit ? { usageLimit: 4 } : {}) }] }] },
      couponClient: { createMany: async ({ data }: any) => { written = data; } } },
  });
  const result = await handler({});
  assert.equal(result.generatableCoupons.length, 1);
  assert.deepEqual(written, [{ couponId: 'coupon', clientId: 'client', usageLimit: 1 }]);
});

test('coupon detail gates modal queries and reports failed client mutations', async () => {
  const queries: any[] = [], notifications: any[] = [];
  const props = vue.reactive({ coupon: { id: 'coupon', companyId: 'branch', audienceType: 'SPECIFIC' } });
  const query = (model: string) => (args: any, options: any) => {
    queries.push({ model, args, options });
    return { data: vue.ref([]), isLoading: vue.ref(false) };
  };
  let failing = true;
  const mutation = () => ({ mutateAsync: async () => { if (failing) throw Error('Rejected test mutation'); } });
  const detail = load('components/Coupon/CouponDetail.vue', {
    ...vue, defineProps: () => props, defineEmits: () => () => {}, useToast: () => ({ add: (value: any) => notifications.push(value) }),
    useCreateCouponClient: mutation, useDeleteCouponClient: mutation,
    useFindManyCouponUsage: query('usage'), useCountCouponUsage: query('usage-count'),
    useFindManyCouponClient: query('assignment'), useCountCouponClient: query('assignment-count'),
    useFindManyCompanyClient: query('company-client'),
  }, 'isAddClientModalOpen,addClient,removeClient');
  const clients = queries.find(row => row.model === 'company-client');
  assert.equal(vue.toValue(clients.options.enabled), false);
  assert.equal(vue.toValue(clients.args).where.companyId, 'branch');
  detail.isAddClientModalOpen.value = true;
  assert.equal(vue.toValue(clients.options.enabled), true);
  props.coupon.audienceType = 'ALL';
  assert.equal(vue.toValue(queries.find(row => row.model === 'assignment-count').options.enabled), false);
  await detail.addClient('client');
  await detail.removeClient('assignment');
  assert.deepEqual(notifications.map(row => row.color), ['red', 'red']);
  failing = false;
  await detail.addClient('client');
  assert.equal(notifications.at(-1).color, 'green');
});

test('coupon form preserves failed saves, prevents duplicates and saves edit targets', async () => {
  const calls: any[] = [], notices: any[] = [];
  let failing = true, release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const mutation = (kind: string) => () => ({ mutateAsync: async (args: any) => {
    calls.push({ kind, args });
    if (failing) throw Error('Rejected test save');
    if (gate) await gate;
  } });
  const page = load('pages/coupon/index.vue', { ...vue, useCompanyScope: () => ({}),
    useCreateCoupon: mutation('create'), useUpdateCoupon: mutation('update'), useDeleteCoupon: mutation('delete'),
    useToast: () => ({ add: (notice: any) => notices.push(notice) }),
  }, 'openForm,saveCoupon,showForm,saving,selectedCoupon,deleteCouponRow');
  const form = { code: 'TEST', companyId: 'branch', startDate: '2026-01-01', endDate: '2026-12-31', targetType: 'ALL' };
  page.openForm();
  await page.saveCoupon(form);
  assert.equal(page.showForm.value, true);
  assert.equal(page.saving.value, false);
  assert.equal(notices.at(-1).color, 'red');
  failing = false;
  gate = new Promise<void>(resolve => { release = resolve; });
  const saving = page.saveCoupon(form);
  assert.equal(page.saving.value, true);
  await page.saveCoupon(form);
  assert.equal(calls.length, 2);
  release!(); await saving; gate = undefined;
  assert.equal(page.showForm.value, false);
  assert.equal(page.saving.value, false);
  assert.equal(calls.at(-1).args.data.company.connect.id, 'branch');
  page.selectedCoupon.value = { id: 'coupon', targetType: 'ALL' };
  page.openForm(page.selectedCoupon.value);
  await page.saveCoupon({ ...form, targetType: 'PRODUCT' });
  assert.equal(calls.at(-1).args.data.targetType, 'PRODUCT');
  assert.equal(page.selectedCoupon.value.targetType, 'PRODUCT');
  failing = true;
  await page.deleteCouponRow('coupon');
  assert.equal(page.selectedCoupon.value.id, 'coupon');
  assert.equal(notices.at(-1).color, 'red');
});

test('notification reads and marking as read authorize the company before touching records', async () => {
  let companyId = 'branch', denied = false;
  const calls: any[] = [];
  const bindings = { defineEventHandler: (fn: any) => fn, createError,
    requireAuthSession: async () => ({ data: session() }), getReadCompanyId: async () => {
      if (denied) throw createError({ statusCode: 403 }); return companyId;
    }, getRouterParam: () => 'notification',
    getQuery: () => ({ companyId: 'outside', userId: 'spoofed' }),
    prisma: { notification: { findMany: async (args: any) => { calls.push(args); return []; },
      updateMany: async (args: any) => { calls.push(args); return { count: 1 }; } } } };
  for (const file of ['server/api/notifications/index.get.ts', 'server/api/notifications/read-all.patch.ts', 'server/api/notifications/[id]/read.patch.ts']) {
    denied = false;
    const handler = load(file, bindings);
    await handler({});
    assert.equal(calls.at(-1).where.companyId, 'branch');
    const before = calls.length;
    denied = true;
    await assert.rejects(handler({}), (error: any) => error.statusCode === 403);
    assert.equal(calls.length, before);
  }
});

test('notification refresh ignores old-company responses and cleans up polling', async () => {
  const auth = { session: vue.ref({ companyId: 'head', id: 'admin' }) };
  let mount: () => void, unmount: () => void, poll: () => void, cleared = false;
  const listeners = new Map<string, () => void>(), pending = new Map<string, (rows: any[]) => void>();
  const requests: any[] = [];
  const { useNotifications } = load('composables/useNotifications.ts', {
    ...vue, NOTIFICATION_TYPES: ['SYSTEM_ALERT'], useNuxtApp: () => ({ $auth: auth }),
    onMounted: (fn: () => void) => { mount = fn; }, onUnmounted: (fn: () => void) => { unmount = fn; },
    setInterval: (fn: () => void) => { poll = fn; return 1; }, clearInterval: () => { cleared = true; },
    window: { addEventListener: (key: string, fn: () => void) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) },
    document: { visibilityState: 'visible', addEventListener: (key: string, fn: () => void) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) },
    $fetch: (_url: string, options: any) => { requests.push(options); return new Promise(resolve => pending.set(options.query.companyId, resolve)); },
  }, 'useNotifications');
  const notifications = useNotifications(); mount!();
  auth.session.value.companyId = 'branch'; await vue.nextTick();
  assert.equal(requests[0].signal.aborted, true);
  pending.get('branch')!([{ id: 'branch-notification', companyId: 'branch', read: false }]);
  await new Promise(resolve => setImmediate(resolve));
  pending.get('head')!([{ id: 'head-notification', companyId: 'head' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(notifications.notifications.value.map((row: any) => row.id), ['branch-notification']);
  assert.equal(notifications.isConnected.value, true);
  assert.equal(notifications.unreadCount.value, 1);
  poll!(); assert.equal(requests.at(-1).query.companyId, 'branch');
  unmount!(); assert.equal(cleared, true); assert.equal(listeners.size, 0);
  assert.equal(requests.at(-1).signal.aborted, true);
  pending.get('branch')!([{ id: 'late-after-unmount', companyId: 'branch' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(notifications.notifications.value.map((row: any) => row.id), ['branch-notification']);
});

test('low-stock notification owns its variant and succeeds without a placeholder broadcast', async () => {
  const body = { type: 'LOW_STOCK', companyId: 'branch', userId: 'spoofed', variantId: 'variant' };
  let writes = 0, lookup: any;
  const handler = load('server/api/notifications/notify.post.ts', {
    defineEventHandler: (fn: any) => fn, createError, requireAuthSession: async () => ({ data: session() }),
    readBody: async () => body, assertCompanyAccess: async (_event: any, id: string) => assert.equal(id, 'branch'),
    fetch: () => assert.fail('Notification creation must not call the unconfigured broadcast service'),
    prisma: { variant: { findFirst: async (args: any) => { lookup = args;
      return args.where.id === 'variant' ? { id: 'variant', name: 'Test', product: { id: 'product', name: 'Test' }, items: [{ qty: 3 }, { qty: 2 }] } : null; } },
      notification: { create: async ({ data }: any) => { writes++; return { id: 'notification', ...data }; } } },
  });
  const result = await handler({});
  assert.equal(result.success, true);
  assert.equal(result.notification.user.connect.id, 'admin');
  assert.match(result.notification.message, /Quantity left : 5/);
  assert.deepEqual(lookup.where, { id: 'variant', companyId: 'branch' });
  body.variantId = 'outside';
  await assert.rejects(handler({}), (error: any) => error.statusCode === 404);
  assert.equal(writes, 1);
});

test('seller model endpoint rejects anonymous access before constructing a database client', async () => {
  let constructed = false;
  const endpoint = load('server/api/model/[...].ts', {
    createEventHandler: (options: any) => options,
    requireAuthSession: async () => { throw createError({ statusCode: 401 }); },
    useAuthSession: async () => ({ data: {} }),
    enhance: () => { constructed = true; return {}; }, prisma: {},
    authorizedCompanyIds: async () => [], scopeOrganizationModelReads: () => ({}),
  });
  await assert.rejects(endpoint.getPrisma({}), (error: any) => error.statusCode === 401);
  assert.equal(constructed, false);
});

test('coupon list combines filters, counts all matches and limits bulk changes to selected IDs', async () => {
  const mutations: any[] = [];
  const mounted: Array<() => void> = [];
  let preferenceReads = 0;
  const api = load('components/Coupon/CouponList.vue', {
    ...vue, defineProps: () => ({}), defineEmits: () => () => {},
    onMounted: (callback: () => void) => mounted.push(callback),
    localStorage: { getItem: () => { preferenceReads++; return '20'; }, setItem: () => {} },
    useNuxtApp: () => ({ $auth: { session: vue.ref(session()) } }),
    useCompanyScope: () => ({ readIds: vue.ref(['head', 'branch']), columns: (columns: any) => columns }),
    useUpdateManyCoupon: () => ({ mutateAsync: async (args: any) => { mutations.push(args); } }),
    useFindManyCoupon: () => ({ data: vue.ref([{ id: 'first-of-many' }]) }),
    useCountCoupon: () => ({ data: vue.ref(42) }),
  }, 'queryArgs,selectedType,selectedAudienceType,selectedStatus,pageTotal,active');
  assert.equal(preferenceReads, 0, 'Server and first client render must share the default page size');
  assert.equal(api.queryArgs.value.take, 10);
  mounted.forEach(callback => callback());
  assert.equal(api.queryArgs.value.take, 20, 'Saved page size applies only after hydration');
  api.selectedType.value = ['PERCENTAGE'];
  api.selectedAudienceType.value = ['SPECIFIC'];
  api.selectedStatus.value = [true];
  const where = api.queryArgs.value.where;
  assert.deepEqual(where.type, { in: ['PERCENTAGE'] });
  assert.deepEqual(where.audienceType, { in: ['SPECIFIC'] });
  assert.equal(where.isActive, true);
  api.selectedStatus.value = [true, false];
  assert.equal(api.queryArgs.value.where.isActive, undefined);
  assert.equal(api.pageTotal.value, 42);
  await api.active([{ id: 'head-coupon' }, { id: 'branch-coupon' }])[0][0].click();
  assert.deepEqual(mutations[0].where.id, { in: ['head-coupon', 'branch-coupon'] });
  await api.active([])[0][0].click();
  assert.equal(mutations.length, 1, 'An empty selection must not reach updateMany');
});

test('head-office membership refresh avoids writes when branch access is already current', async () => {
  const mutations: any[] = [];
  const members = [{ companyId: 'branch', delegatedHeadOfficeId: 'head', status: true, deleted: false }];
  const { ensureHeadOfficeBranchMemberships } = load('server/utils/organizationAccess.ts', {
    createError, prisma: { company: { findMany: async () => [{ id: 'branch' }] }, companyUser: {
      findUnique: async () => ({ role: 'admin', status: true, deleted: false,
        company: { id: 'head', status: true, isHeadOffice: true, parentCompanyId: null } }),
      findMany: async () => members,
      createMany: async (args: any) => { mutations.push({ kind: 'create', ...args }); },
      updateMany: async (args: any) => { mutations.push({ kind: 'update', ...args }); },
    } },
  }, 'ensureHeadOfficeBranchMemberships');
  await ensureHeadOfficeBranchMemberships('admin', 'head', 'Admin');
  assert.equal(mutations.length, 0);
  members[0].status = false;
  await ensureHeadOfficeBranchMemberships('admin', 'head', 'Admin');
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].where.companyId.in, ['branch']);
  assert.equal(mutations[0].where.delegatedHeadOfficeId, 'head');
});

test('account defaults never provision records during a read-only accounting request', async () => {
  let readOnly = true;
  const writes: any[] = [];
  const router: any = new Proxy({}, { get: () => () => router });
  const { ensureDefaults } = load('server/utils/accountant/accounts.ts', {
    z, Router: () => router, requireAuth: () => {}, rbac: () => () => {}, asyncHandler: (fn: any) => fn,
    context: () => ({ readOnly }), prisma: { accountingAccount: {
      createMany: async (args: any) => { writes.push(args); },
      findFirst: async () => ({ id: 'existing-bank', isPrimary: true, isSystem: true }),
    } },
  }, 'ensureDefaults');
  await ensureDefaults('branch'); assert.equal(writes.length, 0);
  readOnly = false;
  await ensureDefaults('branch'); assert.equal(writes.length, 1);
  assert.ok(writes[0].data.every((row: any) => row.companyId === 'branch'));
});

test('AI table readiness only reads and recovers after unavailable schema', async () => {
  for (const [file, name] of [['server/utils/aiProviders.ts', 'ensureAiProvidersTable'], ['server/utils/aiUsage.ts', 'ensureAiUsageEventsTable']]) {
    const queries: string[] = [];
    const loaded = load(file, { createError, pool: { query: async (sql: string) => {
      queries.push(sql);
      if (queries.length === 1) throw Object.assign(Error('Missing test table'), { code: '42P01' });
      return { rows: [] };
    } } }, name);
    await assert.rejects(loaded[name](), (error: any) => error.statusCode === 503);
    await Promise.all([loaded[name](), loaded[name]()]);
    assert.equal(queries.length, 2);
    assert.ok(queries.every(sql => /^\s*SELECT\b/i.test(sql) && !/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(sql)));
  }
});

test('read-only audit middleware stops mutations and cloud workflows before handlers', async () => {
  const guard = load('tests/helpers/readonly-request-middleware.ts', { createError, defineEventHandler, getRequestURL, setResponseHeader });
  let reached = 0;
  const app = createApp().use(guard).use(defineEventHandler(() => { reached++; return { success: true }; }));
  const request = toWebHandler(app);
  const mutation = await request(new Request('http://audit.invalid/api/branch-e2e-readonly-probe', { method: 'POST' }));
  assert.equal(mutation.status, 409); assert.equal(mutation.headers.get('x-branch-audit-blocked'), 'mutation');
  const cloud = await request(new Request('http://audit.invalid/api/ecommerce-cms/storefront-source'));
  assert.equal(cloud.status, 409); assert.equal(cloud.headers.get('x-branch-audit-blocked'), 'external-workflow');
  assert.equal(reached, 0);
  assert.equal((await request(new Request('http://audit.invalid/api/auth/switch-company', { method: 'POST' }))).status, 200);
  assert.equal((await request(new Request('http://audit.invalid/api/model/item/findMany'))).status, 200);
  assert.equal((await request(new Request('http://audit.invalid/api/billSale/findManyBills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 200);
  assert.equal(reached, 3);
});

test('CMS and storefront readiness checks only inspect tables and preserve legacy video reads', async () => {
  const cases = [
    ['server/utils/ecommFaqs.ts', 'ensureEcommCmsTables'],
    ['server/utils/ecommContactMessages.ts', 'ensureEcommContactMessagesTable'],
    ['server/utils/ecommProductReviews.ts', 'ensureEcommProductReviewsTable'],
    ['server/utils/ecommGallery.ts', 'ensureEcommGalleryTable'],
    ['server/utils/storefrontAgent.ts', 'ensureStorefrontAgentSessionsTable'],
    ['server/utils/storefrontSource.ts', 'ensureStorefrontSourcesTable'],
    ['server/utils/storefrontDesign.ts', 'ensureStorefrontDesignTable'],
    ['server/utils/storefrontPages.ts', 'ensureStorefrontPagesTable'],
  ];
  for (const [file, name] of cases) {
    const queries: string[] = [];
    let missing = true;
    const { createTableReadinessCheck } = load('server/utils/schemaReadiness.ts', { createError, pool: {
      query: async (sql: string) => { queries.push(sql); return { rows: missing ? [{ name: 'missing-test-table' }] : [] }; },
    } }, 'createTableReadinessCheck');
    const loaded = load(file, { createError, createTableReadinessCheck,
      storefrontTransport: () => { throw Error('Readiness must not call the cloud orchestrator'); },
    }, name + (file.includes('Gallery') ? ',normalizeGalleryType' : ''));
    await assert.rejects(loaded[name](), (error: any) => error.statusCode === 503);
    missing = false;
    await Promise.all([loaded[name](), loaded[name]()]);
    assert.equal(queries.length, 2);
    assert.ok(queries.every(sql => /^\s*SELECT\b/i.test(sql) && !/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(sql)));
    if (loaded.normalizeGalleryType) assert.equal(loaded.normalizeGalleryType('YOUTUBE'), 'VIDEO');
  }
});

test('AI usage endpoint and its agent-session dependency remain SELECT-only in both companies', async () => {
  const queries: Array<{ sql: string; params: any[] }> = [];
  const pool = { query: async (sql: string, params: any[] = []) => {
    assert.match(sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(sql, /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i);
    queries.push({ sql, params });
    return { rows: [] };
  } };
  const { createTableReadinessCheck } = load('server/utils/schemaReadiness.ts', { createError, pool }, 'createTableReadinessCheck');
  const { ensureStorefrontAgentSessionsTable } = load('server/utils/storefrontAgent.ts', { createError, pool, createTableReadinessCheck,
    storefrontTransport: () => { throw Error('Usage reads must not call the cloud orchestrator'); },
  }, 'ensureStorefrontAgentSessionsTable');
  const { getAiUsageSummary } = load('server/utils/aiUsage.ts', { createError, pool }, 'getAiUsageSummary');
  let companyId = 'head';
  const endpoint = load('server/api/ai/usage.get.ts', {
    defineEventHandler, createError, getQuery: () => ({ days: '7' }),
    useAuthSession: async () => ({ data: { companyId } }), useRuntimeConfig: () => ({}),
    ensureStorefrontAgentSessionsTable, getAiUsageSummary,
  });
  for (const id of ['head', 'branch']) {
    companyId = id;
    const result = await endpoint({});
    assert.equal(result.totals.runs, 0);
    assert.equal(queries.filter(query => query.params[0] === id).length, 3);
  }
  assert.equal(queries.length, 8, 'Both cached readiness checks run once; summaries remain company scoped');
});

test('browser readiness counts pending and failed query/SSR data, including serialized execution', async () => {
  for (const inspect of [hasCompanyRestriction, new Function('value', 'id', `return (${hasCompanyRestriction.toString()})(value,id)`)]) {
    assert.equal(inspect(['zenstack', 'Product', { where: { companyId: { in: ['head', 'branch'] } } }], 'branch'), false);
    assert.equal(inspect(['zenstack', 'Product', { where: { AND: [{ companyId: { in: ['branch'] } }] } }], 'branch'), true);
    assert.equal(inspect({ where: { companyId: 'head' } }, 'branch'), false);
  }
  assert.equal(requestBelongsToDocument('previous-coupon-document', 'brand-document'), false, 'Previous document requests cannot block a freshly mounted form');
  assert.equal(requestBelongsToDocument('brand-document', 'brand-document'), true);
  assert.equal(requestBelongsToDocument(undefined, 'brand-document'), true, 'Requests without a document ID remain tracked');
  assert.equal(requestBelongsToDocument('brand-document', ''), true, 'Navigation startup retains requests until its loader is known');
  const serializedMount = new Function('container', `return (${vuePageMounted.toString()})(container)`);
  for (const inspect of [vuePageMounted, serializedMount]) {
    assert.equal(inspect(undefined), false);
    assert.equal(inspect({ _vnode: { component: { isMounted: false } } }), false);
    assert.equal(inspect({ _vnode: { component: { isMounted: true } } }), true, 'Production root vnode establishes mounting without app._instance');
  }
  const serialized = new Function('client', `return (${activePageQueryState.toString()})(client)`);
  for (const inspect of [activePageQueryState, serialized]) {
    const client = new QueryClient();
    const key = ['page-readiness-fixture'];
    const observer = new QueryObserver(client, { queryKey: key, queryFn: () => new Promise<number>(() => {}), retry: false });
    const unsubscribe = observer.subscribe(() => {});
    try {
      assert.equal(inspect(client).loadingQueries, 1);
      await client.cancelQueries();
      assert.equal(client.getQueryState(key)?.fetchStatus, 'idle');
      assert.equal(inspect(client).loadingQueries, 1, 'Unresolved active data must not be treated as a ready page');
      observer.setOptions({ queryKey: key, queryFn: async () => 42, retry: false });
      assert.equal((await observer.refetch()).data, 42);
      assert.deepEqual(inspect(client), { loadingQueries: 0, failedQueries: 0 });
      observer.setOptions({ queryKey: key, queryFn: async () => { throw Error('Fixture query failed'); }, retry: false });
      await observer.refetch();
      assert.equal(inspect(client).failedQueries, 1);
      observer.setOptions({ queryKey: key, enabled: false, queryFn: async () => 42, retry: false });
      assert.deepEqual(inspect(client), { loadingQueries: 0, failedQueries: 0 }, 'Disabled observers do not block another page');
    } finally { unsubscribe(); client.clear(); }
  }
  const serializedNuxt = new Function('nuxt', `return (${nuxtPageDataState.toString()})(nuxt)`);
  for (const inspect of [nuxtPageDataState, serializedNuxt]) {
    const nuxt = { payload: { _errors: { failed: Error('SSR fixture failure') as unknown, missing: undefined } },
      _asyncData: { loading: { status: vue.shallowRef('pending') }, idle: { status: vue.shallowRef('idle') } } };
    assert.deepEqual(inspect(nuxt), { loadingAsyncData: 1, failedAsyncData: 1 });
    nuxt._asyncData.loading.status.value = 'success';
    nuxt.payload._errors.failed = undefined;
    assert.deepEqual(inspect(nuxt), { loadingAsyncData: 0, failedAsyncData: 0 });
  }
});

test('seller route aliases resolve literal and query-preserving destinations', () => {
  for (const [file, destination] of [
    ['pages/investments/ownership.vue', '/investments/investors'],
    ['pages/order/index.vue', '/order/ecomorders'],
    ['pages/marketing/index.vue', '/ecommerce-cms/marketing'],
  ]) {
    const descriptor = parse(readFileSync(file, 'utf8')).descriptor;
    assert.equal(staticPageRedirect(descriptor.scriptSetup?.content || ''), destination);
  }
  assert.equal(staticPageRedirect("if (false) await navigateTo('/elsewhere')"), '');
  assert.equal(staticPageRedirect("const counter = ref(0); await navigateTo('/elsewhere')"), '');
  assert.equal(staticPageRedirect("await navigateTo('/login')"), '');
});

test('test form audit permits only its own coupon fixture mutations', async () => {
  const previousMode = process.env.BRANCH_E2E_FORM_TESTS, previousPrefix = process.env.BRANCH_E2E_RECORD_PREFIX;
  process.env.BRANCH_E2E_FORM_TESTS = '1'; process.env.BRANCH_E2E_RECORD_PREFIX = 'BRANCH_E2E_TEST_';
  try {
    const guard = load('tests/helpers/readonly-request-middleware.ts', { createError, defineEventHandler, getRequestURL, setResponseHeader, readBody,
      prisma: { coupon: { findUnique: async ({ where }: any) => ({ code: where.id === 'fixture' ? 'BRANCH_E2E_TEST_HEAD' : 'existing-customer-coupon' }) } } });
    let reached = 0;
    const request = toWebHandler(createApp().use(guard).use(defineEventHandler(async event => { reached++; return { body: await readBody(event) }; })));
    const mutate = (operation: string, body: any) => request(new Request('http://audit.invalid/api/model/coupon/' + operation, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal((await mutate('create', { data: { code: 'BRANCH_E2E_TEST_HEAD', company: { connect: { id: 'head' } } } })).status, 200);
    assert.equal((await mutate('create', { data: { code: 'ordinary-coupon' } })).status, 409);
    assert.equal((await mutate('update', { where: { id: 'existing' }, data: { discountValue: 17 } })).status, 409);
    assert.equal((await mutate('update', { where: { id: 'fixture' }, data: { discountValue: 17 } })).status, 200);
    assert.equal((await mutate('update', { where: { id: 'fixture' }, data: { clientCoupons: { create: {} } } })).status, 409);
    assert.equal((await mutate('updateMany', { where: {}, data: { isActive: false } })).status, 409);
    assert.equal((await request(new Request('http://audit.invalid/api/billSale/findManyBills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 409);
    assert.equal((await mutate('delete', { where: { id: 'fixture' } })).status, 200);
    const deletion = await request(new Request('http://audit.invalid/api/model/coupon/delete?q=' + encodeURIComponent(JSON.stringify({ where: { id: 'fixture' } })), { method: 'DELETE' }));
    assert.equal(deletion.status, 200);
    assert.equal(reached, 4);
  } finally {
    if (previousMode === undefined) delete process.env.BRANCH_E2E_FORM_TESTS; else process.env.BRANCH_E2E_FORM_TESTS = previousMode;
    if (previousPrefix === undefined) delete process.env.BRANCH_E2E_RECORD_PREFIX; else process.env.BRANCH_E2E_RECORD_PREFIX = previousPrefix;
  }
});
