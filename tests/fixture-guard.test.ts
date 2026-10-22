import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp, toWebHandler } from 'h3';
import middleware from './helpers/readonly-request-middleware';
import { prisma } from '../server/prisma';

test('read-only audit permits verified POST readers and blocks mutations', async () => {
  const previous = process.env.BRANCH_E2E_FORM_TESTS;
  const handle = toWebHandler(createApp().use(middleware).use(() => ({ allowed: true })));
  const post = (path: string) => handle(new Request('http://localhost' + path, { method: 'POST' }));
  try {
    delete process.env.BRANCH_E2E_FORM_TESTS;
    for (const path of ['/api/stock-aggregate', '/api/billSale/findManyBills']) assert.equal((await post(path)).status, 200);
    for (const path of ['/api/bill/create', '/api/stock-aggregate/delete', '/api/model/product/update']) assert.equal((await post(path)).status, 409);
    process.env.BRANCH_E2E_FORM_TESTS = '1';
    assert.equal((await post('/api/stock-aggregate')).status, 409);
  } finally {
    if (previous === undefined) delete process.env.BRANCH_E2E_FORM_TESTS;
    else process.env.BRANCH_E2E_FORM_TESTS = previous;
  }
});

test('test form guard permits only opted-in, run-owned scalar fixture mutations', async () => {
  const prefix = 'BRANCH_E2E_GUARD_';
  const keys = ['BRANCH_E2E_FORM_TESTS', 'BRANCH_E2E_CATALOG_FORMS', 'BRANCH_E2E_RECORD_PREFIX'];
  const previous = keys.map(key => process.env[key]);
  const restores: Array<() => void> = [];
  for (const model of ['coupon', 'brand', 'collection', 'category'] as const) {
    const delegate = prisma[model] as any, original = delegate.findUnique;
    delegate.findUnique = async ({ where }: any) => ({ code: where.id === 'own' ? prefix + 'COUPON' : 'ordinary',
      name: where.id === 'own' ? prefix + 'CATALOG' : 'ordinary' });
    restores.push(() => { delegate.findUnique = original; });
  }
  process.env.BRANCH_E2E_FORM_TESTS = '1'; process.env.BRANCH_E2E_RECORD_PREFIX = prefix;
  delete process.env.BRANCH_E2E_CATALOG_FORMS;
  const handle = toWebHandler(createApp().use(middleware).use(() => ({ allowed: true })));
  const call = async (model: string, operation: string, body: any) => handle(new Request(
    `http://localhost/api/model/${model}/${operation}` + (operation === 'delete' ? '?q=' + encodeURIComponent(JSON.stringify(body)) : ''),
    operation === 'delete' ? { method: 'DELETE' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  ));
  const data = { name: prefix + 'NEW', company: { connect: { id: 'branch' } }, status: true };
  try {
    assert.equal((await call('coupon', 'create', { data: { code: prefix + 'NEW', company: data.company } })).status, 200);
    assert.equal((await call('brand', 'create', { data })).status, 409, 'Catalog writes require their own opt-in');
    process.env.BRANCH_E2E_CATALOG_FORMS = '1';
    for (const model of ['brand', 'collection', 'category']) {
      assert.equal((await call(model, 'create', { data })).status, 200);
      assert.equal((await call(model, 'create', { data: { ...data, name: 'ordinary' } })).status, 409);
      assert.equal((await call(model, 'create', { data: { ...data, products: { deleteMany: {} } } })).status, 409);
      assert.equal((await call(model, 'update', { where: { id: 'own' }, data: { description: 'edited' } })).status, 200);
      assert.equal((await call(model, 'update', { where: { id: 'own' }, data: { name: '' } })).status, 409);
      assert.equal((await call(model, 'update', { where: { id: 'ordinary' }, data: { description: 'edited' } })).status, 409);
      assert.equal((await call(model, 'delete', { where: { id: 'own' } })).status, 200);
      assert.equal((await call(model, 'delete', { where: { id: 'ordinary' } })).status, 409);
      assert.equal((await call(model, 'deleteMany', { where: {} })).status, 409);
    }
    assert.equal((await call('category', 'create', { data: { ...data, subcategories: { create: [] } } })).status, 200);
    for (const subcategories of [{ create: [{ name: 'ordinary' }] }, { deleteMany: {} }, { connect: { id: 'ordinary' } }])
      assert.equal((await call('category', 'create', { data: { ...data, subcategories } })).status, 409);
    assert.equal((await call('coupon', 'update', { where: { id: 'own' }, data: { code: '' } })).status, 409);
    assert.equal((await call('user', 'create', { data })).status, 409);
  } finally {
    for (const restore of restores) restore();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await prisma.$disconnect();
  }
});
