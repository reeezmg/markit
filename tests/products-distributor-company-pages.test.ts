import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  createError, createEvent, defineEventHandler, eventHandler, getHeader, getQuery,
  getRequestURL, getRouterParam, readBody,
} from 'h3';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

const REEZC = '5271d5cb-2e97-4303-85c0-3fc9e3e6bb05';
const PUTTUR = 'cbbc74af-a72c-47a0-b92e-18af76d32221';
const MARKIT = '02856c86-60b8-41a4-ba18-79dbd55bf016';
const ADMIN = 'de505401-800f-4560-aba2-00571ea30e7c';

let sessionData: any = { companyId: REEZC, id: ADMIN, email: 'catalog-scope-test@example.invalid', role: 'admin' };
(globalThis as any).requireAuthSession = async () => ({ data: sessionData });
Object.assign(globalThis, {
  createError, defineEventHandler, eventHandler, getHeader, getQuery, getRequestURL, getRouterParam, readBody,
});

function eventFor(method: string, url: string, body: any, companyId: string, authorizedIds: string[], filter?: string) {
  const json = JSON.stringify(body ?? {});
  const req = Readable.from([Buffer.from(json)]) as any;
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(json)),
    'x-company-id': companyId,
    ...(filter ? { 'x-company-filter': filter } : {}),
  };
  req.url = url;
  req.method = method;
  const event = createEvent(req, {} as any);
  event.context.authorizedCompanyIds = Promise.resolve(authorizedIds);
  const path = new URL(url, 'http://local.test').pathname;
  const id = path.match(/\/(?:products|purchasereturn|purchaseorder)\/([^/]+)$/)?.[1];
  if (id) event.context.params = { id };
  return event;
}

const fixtures = [
  { id: REEZC, name: 'reezc', categoryId: '5647543c-c1a5-4f9b-8b32-1f47211d7bbf', authorized: [REEZC, PUTTUR], qty: 11 },
  { id: PUTTUR, name: 'puttur', categoryId: '48356397-0eea-4713-8adc-7fc9a62ff1dc', authorized: [REEZC, PUTTUR], qty: 12 },
  { id: MARKIT, name: 'Markit', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', authorized: [MARKIT], qty: 13 },
];

const productIds: string[] = [];
const variantIds: string[] = [];
const itemIds: string[] = [];
const distributorIds: string[] = [];
const paymentIds: string[] = [];
const purchaseOrderIds: string[] = [];
const purchaseReturnIds: string[] = [];
const temporaryExpenseCategoryIds: string[] = [];
const db = await pool.connect();

try {
  const companyMiddleware = (await import('../server/middleware/company-request')).default as any;
  const saveProducts = (await import('../server/api/products/save-batch.post')).default as any;
  const readProduct = (await import('../server/api/products/[id].get')).default as any;
  const updateProduct = (await import('../server/api/products/update.post')).default as any;
  const deleteProduct = (await import('../server/api/products/delete.post')).default as any;
  const stockAggregate = (await import('../server/api/stock-aggregate.post')).default as any;
  const createPayment = (await import('../server/api/distributor/payments.post')).default as any;
  const createPurchaseOrder = (await import('../server/api/purchaseorder/create.post')).default as any;
  const createPurchaseReturn = (await import('../server/api/purchasereturn/create.post')).default as any;

  for (const fixture of fixtures) {
    sessionData = { ...sessionData, companyId: fixture.id, role: fixture.id === REEZC ? 'admin' : 'manager' };

    const distributorId = randomUUID();
    const scoped = scopeOrganizationModelReads(prisma, fixture.id, fixture.authorized) as any;
    await scoped.distributor.create({
      data: {
        id: distributorId,
        name: `Scope supplier ${fixture.name} ${distributorId.slice(0, 6)}`,
        companies: {
          create: {
            company: { connect: { id: fixture.id } },
            distributorNumber: -Math.floor(Math.random() * 1_000_000_000),
            openingDue: 0,
          },
        },
      },
    });
    distributorIds.push(distributorId);

    let purchaseCategory = await db.query(
      `SELECT id FROM expense_categories WHERE company_id=$1 AND lower(name)='purchase' ORDER BY id LIMIT 1`,
      [fixture.id],
    );
    if (!purchaseCategory.rowCount) {
      const id = randomUUID();
      await db.query(
        `INSERT INTO expense_categories (id,company_id,name,status,created_at,updated_at) VALUES ($1,$2,'Purchase',true,now(),now())`,
        [id, fixture.id],
      );
      temporaryExpenseCategoryIds.push(id);
      purchaseCategory = { rows: [{ id }], rowCount: 1 } as any;
    }

    const productId = randomUUID();
    const variantId = randomUUID();
    const itemId = randomUUID();
    const productBody = {
      companyId: fixture.id,
      products: [{
        id: productId,
        name: `Scope product ${fixture.name}`,
        description: 'company ownership integration test',
        status: true,
        categoryId: fixture.categoryId,
        variants: [{
          id: variantId,
          name: `Scope variant ${fixture.name}`,
          code: `SCOPE-${fixture.name}`,
          unit: 'Nos',
          sprice: 100,
          pprice: 60,
          dprice: 90,
          discount: 10,
          items: [{ id: itemId, size: 'TEST', qty: fixture.qty }],
        }],
      }],
    };
    const saveEvent = eventFor('POST', '/api/products/save-batch', productBody, fixture.id, fixture.authorized);
    await companyMiddleware(saveEvent);
    const saved = await saveProducts(saveEvent);
    assert.deepEqual(saved.productIds, [productId]);
    productIds.push(productId);
    variantIds.push(variantId);
    itemIds.push(itemId);

    const stored = await db.query(
      `SELECT p.company_id product_company, v.company_id variant_company, i.company_id item_company, i.qty
         FROM products p JOIN variants v ON v.product_id=p.id JOIN items i ON i.variant_id=v.id
        WHERE p.id=$1`,
      [productId],
    );
    assert.equal(stored.rows[0].product_company, fixture.id);
    assert.equal(stored.rows[0].variant_company, fixture.id);
    assert.equal(stored.rows[0].item_company, fixture.id);
    assert.equal(Number(stored.rows[0].qty), fixture.qty);

    const loaded = await readProduct(eventFor('GET', `/api/products/${productId}`, null, fixture.id, fixture.authorized));
    assert.equal(loaded.companyId, fixture.id);
    assert.equal(loaded.variants[0].items[0].id, itemId);

    const updateBody = {
      companyId: fixture.id,
      productId,
      product: { name: `Scope product ${fixture.name} updated`, description: 'updated', status: true, categoryId: fixture.categoryId },
      variants: [{
        id: variantId, name: `Scope variant ${fixture.name}`, code: `SCOPE-${fixture.name}`, unit: 'Nos',
        sprice: 110, pprice: 65, dprice: 99, discount: 10,
        items: [{ id: itemId, size: 'TEST', qty: fixture.qty + 1 }],
      }],
    };
    const updateEvent = eventFor('POST', '/api/products/update', updateBody, fixture.id, fixture.authorized);
    await companyMiddleware(updateEvent);
    const updated = await updateProduct(updateEvent);
    assert.equal(updated.product.name, `Scope product ${fixture.name} updated`);
    assert.equal(Number(updated.product.variants[0].items[0].qty), fixture.qty + 1);

    const stockBody = {
      companyId: fixture.id,
      filters: { category: null, brand: null, rating: null, distributor: null, startDate: null, endDate: null },
      groupBy: 'product',
    };
    const stock = await stockAggregate(eventFor('POST', '/api/stock-aggregate', stockBody, fixture.id, fixture.authorized, fixture.id));
    const stockRow = stock.find((row: any) => row.product === `scope product ${fixture.name} updated`.toLowerCase());
    assert.equal(stockRow?.qty, fixture.qty + 1);

    const poEvent = eventFor('POST', '/api/purchaseorder/create', { companyId: fixture.id }, fixture.id, fixture.authorized);
    await companyMiddleware(poEvent);
    const po = await createPurchaseOrder(poEvent);
    purchaseOrderIds.push(po.id);
    assert.equal((await db.query('SELECT company_id FROM purchase_orders WHERE id=$1', [po.id])).rows[0].company_id, fixture.id);

    const paymentBody = {
      companyId: fixture.id,
      distributorId,
      amount: 25,
      paymentType: 'CASH',
      remarks: `Scope payment ${fixture.name}`,
      createExpense: true,
    };
    const paymentEvent = eventFor('POST', '/api/distributor/payments', paymentBody, fixture.id, fixture.authorized);
    await companyMiddleware(paymentEvent);
    const payment = await createPayment(paymentEvent);
    paymentIds.push(payment.id);
    const storedPayment = await db.query(
      `SELECT dp.company_id, dp.expense_id, e.company_id expense_company
         FROM distributor_payments dp JOIN expenses e ON e.id=dp.expense_id WHERE dp.id=$1`,
      [payment.id],
    );
    assert.equal(storedPayment.rows[0].company_id, fixture.id);
    assert.equal(storedPayment.rows[0].expense_company, fixture.id);
    assert.equal(
      (await db.query('SELECT company_id FROM account_ledger_entries WHERE source_id=$1', [storedPayment.rows[0].expense_id])).rows[0].company_id,
      fixture.id,
    );

    const returnBody = {
      companyId: fixture.id,
      distributorId,
      purchaseOrderId: po.id,
      remarks: `Scope return ${fixture.name}`,
      subTotalAmount: 10,
      taxAmount: 0,
      totalAmount: 10,
      items: [{
        itemId, variantId, barcode: saved.products[0].variants[0].items[0].barcode,
        productName: `Scope product ${fixture.name}`, categoryId: fixture.categoryId,
        size: 'TEST', qty: 1, rate: 10, tax: 0, taxAmount: 0, subtotal: 10, reason: 'test',
      }],
    };
    const returnEvent = eventFor('POST', '/api/purchasereturn/create', returnBody, fixture.id, fixture.authorized);
    await companyMiddleware(returnEvent);
    const purchaseReturn = await createPurchaseReturn(returnEvent);
    purchaseReturnIds.push(purchaseReturn.purchaseReturnId);
    assert.equal(
      (await db.query('SELECT company_id FROM purchase_returns WHERE id=$1', [purchaseReturn.purchaseReturnId])).rows[0].company_id,
      fixture.id,
    );
    assert.equal(Number((await db.query('SELECT qty FROM items WHERE id=$1', [itemId])).rows[0].qty), fixture.qty);
  }

  sessionData = { ...sessionData, companyId: REEZC, role: 'admin' };
  const headScoped = scopeOrganizationModelReads(prisma, REEZC, [REEZC, PUTTUR]) as any;
  const headSupplierIds = new Set((await headScoped.distributor.findMany({ where: { id: { in: distributorIds } } })).map((row: any) => row.id));
  assert.ok(headSupplierIds.has(distributorIds[0]));
  assert.ok(headSupplierIds.has(distributorIds[1]));
  assert.ok(!headSupplierIds.has(distributorIds[2]));
  const branchScoped = scopeOrganizationModelReads(prisma, PUTTUR, [PUTTUR]) as any;
  const branchSupplierIds = new Set((await branchScoped.distributor.findMany({ where: { id: { in: distributorIds } } })).map((row: any) => row.id));
  assert.deepEqual([...branchSupplierIds], [distributorIds[1]]);

  const branchProduct = await readProduct(eventFor('GET', `/api/products/${productIds[1]}`, null, REEZC, [REEZC, PUTTUR]));
  assert.equal(branchProduct.companyId, PUTTUR);
  await assert.rejects(
    readProduct(eventFor('GET', `/api/products/${productIds[2]}`, null, REEZC, [REEZC, PUTTUR])),
    (error: any) => error?.statusCode === 404,
  );

  const wrongSupplierPayment = eventFor('POST', '/api/distributor/payments', {
    companyId: PUTTUR, distributorId: distributorIds[0], amount: 1, paymentType: 'CASH', createExpense: false,
  }, PUTTUR, [REEZC, PUTTUR]);
  await assert.rejects(companyMiddleware(wrongSupplierPayment), (error: any) => error?.statusCode === 400);

  const mixedProduct = eventFor('POST', '/api/products/save-batch', {
    companyId: PUTTUR,
    products: [{ name: 'Invalid mixed product', categoryId: fixtures[0].categoryId, variants: [] }],
  }, PUTTUR, [REEZC, PUTTUR]);
  await assert.rejects(companyMiddleware(mixedProduct), (error: any) => error?.statusCode === 403);

  sessionData = { ...sessionData, companyId: MARKIT, role: 'manager' };
  const wrongDelete = eventFor('POST', '/api/products/delete', { companyId: MARKIT, id: productIds[0] }, MARKIT, [MARKIT]);
  await assert.rejects(companyMiddleware(wrongDelete), (error: any) => error?.statusCode === 403);

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    sessionData = { ...sessionData, companyId: fixture.id, role: fixture.id === REEZC ? 'admin' : 'manager' };
    const deleteEvent = eventFor('POST', '/api/products/delete', { companyId: fixture.id, id: productIds[i] }, fixture.id, fixture.authorized);
    await companyMiddleware(deleteEvent);
    const deleted = await deleteProduct(deleteEvent);
    assert.equal(deleted.deleted, 1);
  }
  productIds.length = 0;
  variantIds.length = 0;
  itemIds.length = 0;

  console.log('PASS Products and Distributor pages for reezc, puttur branch, and Markit: product save/read/edit/stock/delete, supplier links, PO creation, payments+expenses+ledger, purchase returns, filtering, and cross-company rejection');
} finally {
  if (purchaseReturnIds.length) {
    await db.query('DELETE FROM distributor_payments WHERE purchase_return_id = ANY($1::text[])', [purchaseReturnIds]);
    await db.query('DELETE FROM purchase_return_items WHERE purchase_return_id = ANY($1::text[])', [purchaseReturnIds]);
    await db.query('DELETE FROM purchase_returns WHERE id = ANY($1::text[])', [purchaseReturnIds]);
  }
  if (paymentIds.length) {
    const expenses = await db.query('SELECT expense_id FROM distributor_payments WHERE id = ANY($1::text[]) AND expense_id IS NOT NULL', [paymentIds]);
    const expenseIds = expenses.rows.map(row => row.expense_id);
    if (expenseIds.length) await db.query('DELETE FROM account_ledger_entries WHERE source_id = ANY($1::text[])', [expenseIds]);
    await db.query('DELETE FROM distributor_payments WHERE id = ANY($1::text[])', [paymentIds]);
    if (expenseIds.length) await db.query('DELETE FROM expenses WHERE id = ANY($1::text[])', [expenseIds]);
  }
  if (productIds.length) await db.query('DELETE FROM products WHERE id = ANY($1::text[])', [productIds]);
  if (purchaseOrderIds.length) await db.query('DELETE FROM purchase_orders WHERE id = ANY($1::text[])', [purchaseOrderIds]);
  if (distributorIds.length) {
    await db.query('DELETE FROM distributor_companies WHERE distributor_id = ANY($1::text[])', [distributorIds]);
    await db.query('DELETE FROM distributors WHERE id = ANY($1::text[])', [distributorIds]);
  }
  if (temporaryExpenseCategoryIds.length) await db.query('DELETE FROM expense_categories WHERE id = ANY($1::text[])', [temporaryExpenseCategoryIds]);
  const leftovers = await db.query(
    `SELECT
       (SELECT count(*)::int FROM products WHERE name LIKE 'Scope product %') products,
       (SELECT count(*)::int FROM distributors WHERE name LIKE 'Scope supplier %') distributors,
       (SELECT count(*)::int FROM expenses WHERE note LIKE 'Scope payment %') expenses,
       (SELECT count(*)::int FROM purchase_returns WHERE remarks LIKE 'Scope return %') returns`,
  );
  assert.deepEqual(leftovers.rows[0], { products: 0, distributors: 0, expenses: 0, returns: 0 });
  db.release();
  await pool.end();
  await prisma.$disconnect();
}
