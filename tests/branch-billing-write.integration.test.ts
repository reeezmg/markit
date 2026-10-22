import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { createError, createEvent, defineEventHandler, getHeader, getQuery, getRequestURL, readBody } from 'h3';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';
import { legacyLedgerGuard } from './legacy-ledger-guard';
import { generateCouponsForBill } from '../server/utils/generatedCoupons';

// Real middleware/handlers/triggers, schema-free, with all commits converted to
// savepoints inside one rollback-only transaction. No browser/login claims.
const db = await pool.connect(), originalConnect = pool.connect.bind(pool), originalQuery = pool.query.bind(pool);
const originalFind = prisma.bill.findUnique.bind(prisma.bill);
const stockRestores: Array<() => void> = [], stockIds = new Set<string>();
const own = new Set<string>(), results: any[] = [];
const firstBillByCompany = new Map<string, string>();
let depth = 0, legacy: (() => Promise<void>) | undefined;
const query = async (sql: string, args?: any[]) => {
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|FUNCTION|INDEX|TRIGGER|TYPE)\b/i);
  if (sql === 'BEGIN') return db.query(`SAVEPOINT billing_${++depth}`);
  if (sql === 'COMMIT') {
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('SET CONSTRAINTS ALL DEFERRED');
    await legacy?.();
    return db.query(`RELEASE SAVEPOINT billing_${depth--}`);
  }
  if (sql === 'ROLLBACK') {
    if (!depth) return { rows: [], rowCount: 0 };
    const name = `billing_${depth--}`;
    await db.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return db.query(`RELEASE SAVEPOINT ${name}`);
  }
  return db.query(sql, args);
};
const report: any = { startedAt: new Date().toISOString(), schemaChanges: false,
  mode: 'actual handlers and database triggers; rollback-only', results, cleanup: 'pending' };
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='30s'");
  legacy = await legacyLedgerGuard(db);
  const pair = (await db.query(`SELECT h.id head,b.id branch,hu.user_id FROM companies h
    JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status AND NOT hu.deleted
    JOIN companies b ON b.parent_company_id=h.id AND b.status
    JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status AND NOT bu.deleted
    WHERE h.is_head_office AND h.parent_company_id IS NULL AND h.status ORDER BY h.id,b.id LIMIT 1`)).rows[0];
  assert.ok(pair, 'An existing authorized head-office and branch pair is required');
  const session = { data: { id: pair.user_id, companyId: pair.head, role: 'admin' } };
  Object.assign(globalThis, { createError, defineEventHandler, getHeader, getQuery, getRequestURL, readBody,
    requireAuthSession: async () => session, useAuthSession: async () => session });
  (pool as any).connect = async () => ({ query, release() {} });
  (pool as any).query = query;
  (prisma.bill as any).findUnique = async (args: any) => own.has(args.where.id)
    ? (await db.query('SELECT company_id AS "companyId" FROM bills WHERE id=$1', [args.where.id])).rows[0] ?? null : originalFind(args);
  for (const [model, table] of Object.entries({ product: 'products', variant: 'variants', item: 'items' })) {
    const delegate = (prisma as any)[model], original = delegate.findUnique.bind(delegate);
    delegate.findUnique = async (args: any) => stockIds.has(args.where.id)
      ? (await db.query(`SELECT company_id AS "companyId" FROM ${table} WHERE id=$1`, [args.where.id])).rows[0] ?? null : original(args);
    stockRestores.push(() => { delegate.findUnique = original; });
  }
  const middleware = (await import('../server/middleware/company-request')).default;
  const create = (await import('../server/api/bill/create.post')).default;
  const remove = (await import('../server/api/billSale/deleteBill.post')).default;
  const restore = (await import('../server/api/billSale/restoreBill.post')).default;
  const createProduct = (await import('../server/api/products/save-batch.post')).default;
  const editProduct = (await import('../server/api/products/update.post')).default;
  const deleteProduct = (await import('../server/api/products/delete.post')).default;
  const collect = (await import('../server/api/billSale/receipts.post')).default;
  const reverseReceipt = (await import('../server/api/billSale/reverseReceipt.post')).default;
  async function call(handler: any, path: string, body: any, companyId: string) {
    const json = JSON.stringify(body), req = Readable.from([Buffer.from(json)]) as any;
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': companyId };
    req.method = 'POST'; req.url = path;
    const event = createEvent(req, {} as any);
    event.context.authorizedCompanyIds = Promise.resolve(session.data.companyId === pair.head ? [pair.head, pair.branch] : [pair.branch]);
    await middleware(event);
    return handler(event);
  }
  for (const role of ['head', 'branch'] as const) {
    const companyId = pair[role]; session.data.companyId = companyId;
    const category = (await db.query('SELECT id FROM categories WHERE company_id=$1 LIMIT 1', [companyId])).rows[0];
    assert.ok(category, `${role}: an existing category is required`);
    const productId = randomUUID(), variantId = randomUUID(), itemId = randomUUID();
    for (const id of [productId, variantId, itemId]) stockIds.add(id);
    await call(createProduct, '/api/products/save-batch', { companyId, products: [{ id: productId,
      name: 'BRANCH_E2E_CATALOG_PRODUCT', categoryId: category.id, variants: [{ id: variantId,
        name: 'Fixture variant', sprice: 118, pprice: 0, items: [{ id: itemId, size: 'M', qty: 10 }] }] }] }, companyId);
    const methods = ['Cash', 'UPI', 'Credit', 'Split', 'Card'];
    for (const method of methods) {
      const beforeStock = Number((await db.query('SELECT qty FROM items WHERE id=$1', [itemId])).rows[0].qty);
      const id = randomUUID(); own.add(id);
      if (!firstBillByCompany.has(companyId)) firstBillByCompany.set(companyId, id);
      const pending = method === 'Credit' || method === 'Split';
      const payload: any = { subtotal: 118, grandTotal: 118, discount: 0, discountType: 'percentage', returnAmt: 0,
        paymentMethod: method, paymentStatus: pending ? 'PENDING' : 'PAID', type: 'BILL', createdAt: new Date().toISOString(),
        company: { connect: { id: companyId } }, companyUser: { connect: { companyId_userId: { companyId, userId: pair.user_id } } },
        entries: { create: [{ name: 'BRANCH_E2E_BILL_SOURCE', qty: 1, rate: 118, value: 118, tax: 18, discount: 0,
          return: false, category: { connect: { id: category.id } }, item: { connect: { id: itemId } },
          variant: { connect: { id: variantId } } }] } };
      if (pending) payload.creditUserId = pair.user_id;
      if (method === 'Split') payload.splitPayments = [{ method: 'Cash', amount: 50 }, { method: 'Credit', amount: 68 }];
      if (method === 'Card') {
        // Two units sold and one returned on the same row: physical net sale is one.
        const sale = payload.entries.create[0];
        payload.returnAmt = 118;
        payload.entries.create = [{ ...sale, qty: 2, value: 236, tax: 0 }, { ...sale, qty: 1, value: 118, tax: 0, return: true }];
      }
      const body = { uuid: id, companyId, userId: pair.user_id, payload, billPoints: 0, items: [], returnedItems: [] };
      const saved = await call(create, '/api/bill/create', body, companyId);
      assert.equal(saved.billId, id); assert.ok(Number(saved.invoiceNumber) > 0);
      assert.equal(Number((await db.query('SELECT qty FROM items WHERE id=$1', [itemId])).rows[0].qty), beforeStock - 1);
      assert.deepEqual(await call(create, '/api/bill/create', body, companyId), saved, 'Retry returns the same saved result');
      await assert.rejects(call(create, '/api/bill/create', { ...body, payload: { ...payload, grandTotal: 999 } }, companyId), /different details/);
      const row = (await db.query('SELECT company_id,payment_method,grand_total FROM bills WHERE id=$1', [id])).rows[0];
      assert.equal(row.company_id, companyId); assert.equal(row.payment_method, method); assert.equal(Number(row.grand_total), 118);
      assert.equal((await db.query('SELECT count(*)::int count FROM entries WHERE bill_id=$1', [id])).rows[0].count, method === 'Card' ? 2 : 1);
      const settings = (await db.query('SELECT enabled FROM accountant_v2_erp_settings WHERE company_id=$1', [companyId])).rows[0];
      assert.equal(settings?.enabled, true, `${role}: enable ERP accounting before this posting test`);
      const source = (await db.query(`SELECT s.journal_id FROM accountant_v2_erp_sources s
        WHERE company_id=$1 AND source_key=$2`, [companyId, `bill:${id}`])).rows[0];
      if (settings?.enabled) {
        assert.ok(source?.journal_id, 'An enabled company must post the new bill');
        const balance = (await db.query(`SELECT sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END) balance
          FROM accountant_v2_manual_journal_lines WHERE journal_id=$1`, [source.journal_id])).rows[0].balance;
        assert.equal(Number(balance), 0, 'Native journal balances');
        const lines = (await db.query(`SELECT account_id,company_id,sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END) amount
          FROM accountant_v2_manual_journal_lines WHERE journal_id=$1 AND deleted_at IS NULL GROUP BY account_id,company_id`,[source.journal_id])).rows;
        const mappings = (await db.query('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1',[companyId])).rows[0].accounts;
        const expected: Record<string,number> = { [mappings.sales]: method==='Card' ? -118 : -100 };
        if (method!=='Card') expected[mappings.outputTax]=-18;
        if (method==='Credit') expected[mappings.receivable]=118;
        else if (method==='Split') {expected[mappings.cash]=50;expected[mappings.receivable]=68;}
        else expected[mappings[method==='Cash'?'cash':'bank']]=118;
        const actual: Record<string,number> = {};
        for (const line of lines) { assert.equal(line.company_id,companyId);if(Number(line.amount))actual[line.account_id]=Number(line.amount); }
        assert.deepEqual(actual,expected,`${role} ${method}: exact sales/tax/settlement accounts and amounts`);
      }
      if (pending) assert.equal(Number((await db.query(`SELECT amount FROM user_ledger_entries
        WHERE company_id=$1 AND source_id=$2 AND type='USER_CREDIT_BILL'`, [companyId, id])).rows[0].amount), method === 'Split' ? 68 : 118);
      await call(remove, '/api/billSale/deleteBill', { billId: id, companyId }, companyId);
      assert.equal(Number((await db.query('SELECT qty FROM items WHERE id=$1', [itemId])).rows[0].qty), beforeStock);
      await call(restore, '/api/billSale/restoreBill', { billId: id, companyId }, companyId);
      assert.equal(Number((await db.query('SELECT qty FROM items WHERE id=$1', [itemId])).rows[0].qty), beforeStock - 1);
      results.push({ company: role, method, status: 'passed', checks: ['create', 'owner', 'invoice-number', 'idempotent-retry', 'changed-retry-rejected', 'entries', 'stock-sale-delete-restore', ...(method === 'Card' ? ['mixed-sale-and-return-net-stock'] : []), ...(settings?.enabled ? ['balanced-native-journal'] : ['accounting-not-enabled']), 'delete', 'restore'] });
      console.log(`PASS ${role} ${method}: source create, retry, persisted owner/amount, delete/restore`);
    }
    await call(editProduct, '/api/products/update', { companyId, productId, product: { name: 'BRANCH_E2E_PRODUCT_EDITED' },
      variants: [{ id: variantId, name: 'Edited fixture variant', pprice: 0, sprice: 118, items: [{ id: itemId, size: 'M' }] }] }, companyId);
    const editedStock = (await db.query('SELECT qty,initial_qty,sold_qty FROM items WHERE id=$1', [itemId])).rows[0];
    assert.deepEqual([Number(editedStock.qty), Number(editedStock.initial_qty), Number(editedStock.sold_qty)], [10 - methods.length, 10, methods.length]);
    await call(deleteProduct, '/api/products/delete', { id: productId, companyId }, companyId);
    assert.equal((await db.query('SELECT id FROM products WHERE id=$1', [productId])).rowCount, 0);
    results.push({ company: role, status: 'passed', form: 'catalog-product', checks: ['batch-create-with-stock', 'metadata-edit-preserves-sold-stock', 'delete'] });
    if (role === 'branch') {
      const headBill = [...own][0];
      await assert.rejects(call(remove, '/api/billSale/deleteBill', { billId: headBill, companyId: pair.branch }, pair.branch));
      results.push({ company: role, status: 'passed', check: 'cross-company-bill-write-rejected' });
    }
    // Customer collections are separate dated postings, not a paid-status toggle.
    const clientId=randomUUID(), creditId=randomUUID();own.add(creditId);
    await db.query('INSERT INTO clients(id,name,phone) VALUES($1,$2,$3)',[clientId,'BRANCH_E2E_RECEIPT_CLIENT','E2E_'+clientId]);
    await db.query('INSERT INTO company_clients(company_id,client_id) VALUES($1,$2)',[companyId,clientId]);
    const date=new Date().toISOString(), mappings=(await db.query('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1',[companyId])).rows[0].accounts;
    await call(create,'/api/bill/create',{uuid:creditId,companyId,userId:pair.user_id,billPoints:0,items:[],returnedItems:[],payload:{
      company:{connect:{id:companyId}},client:{connect:{id:clientId}},subtotal:118,grandTotal:118,discount:0,paymentMethod:'Credit',paymentStatus:'PENDING',type:'BILL',createdAt:date,
      entries:{create:[{name:'BRANCH_E2E_CUSTOMER_CREDIT',qty:1,rate:118,value:118,tax:18,discount:0,return:false,category:{connect:{id:category.id}}}]}}},companyId);
    const receiptBody={companyId,billId:creditId,amount:40,paymentMethod:'Cash',accountId:mappings.cash,paymentDate:date,requestId:randomUUID()};
    const receipt=await call(collect,'/api/billSale/receipts',receiptBody,companyId);
    assert.equal(receipt.outstanding,78); assert.equal(receipt.paymentStatus,'PENDING');
    assert.deepEqual(await call(collect,'/api/billSale/receipts',receiptBody,companyId),receipt,'Receipt retry must not collect twice');
    const foreign=(await db.query('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1',[pair[role==='head'?'branch':'head']])).rows[0].accounts;
    await assert.rejects(call(collect,'/api/billSale/receipts',{...receiptBody,requestId:randomUUID(),accountId:foreign.cash},companyId));
    await assert.rejects(call(collect,'/api/billSale/receipts',{...receiptBody,requestId:randomUUID(),amount:79},companyId),'Overcollection rejected');
    await assert.rejects(call(remove,'/api/billSale/deleteBill',{companyId,billId:creditId},companyId),'Active receipts protect the invoice');
    const full=await call(collect,'/api/billSale/receipts',{...receiptBody,requestId:randomUUID(),amount:78,paymentMethod:'Bank',accountId:mappings.bank},companyId);
    assert.equal(full.outstanding,0);assert.equal(full.paymentStatus,'PAID');
    const reversed=await call(reverseReceipt,'/api/billSale/reverseReceipt',{...receiptBody,requestId:randomUUID(),receiptId:receipt.receiptId},companyId);
    assert.equal(reversed.outstanding,40);
    const expectedReceipts = [[receipt.journalId,{[mappings.cash]:40,[mappings.receivable]:-40}],
      [full.journalId,{[mappings.bank]:78,[mappings.receivable]:-78}],
      [reversed.journalId,{[mappings.cash]:-40,[mappings.receivable]:40}]] as const;
    for (const [journalId,expected] of expectedReceipts) {
      const lines=(await db.query('SELECT company_id,account_id,side,amount FROM accountant_v2_manual_journal_lines WHERE journal_id=$1',[journalId])).rows;
      const actual:Record<string,number>={};
      for(const line of lines){assert.equal(line.company_id,companyId);actual[line.account_id]=(line.side==='DEBIT'?1:-1)*Number(line.amount);}
      assert.deepEqual(actual,expected,'Exact dated collection/reversal accounting');
    }
    const outstanding=(await db.query('SELECT payment_status,payment_method FROM bills WHERE id=$1',[creditId])).rows[0];
    assert.equal(outstanding.payment_status,'PENDING');assert.equal(outstanding.payment_method,'Credit');
    results.push({company:role,status:'passed',form:'customer-credit-receipts',checks:['partial-cash','idempotent-retry','foreign-account-rejected','overcollection-rejected','invoice-delete-protected','full-bank','dated-reversal','exact-journal-lines']});
    console.log(`PASS ${role}: customer credit partial/full collections, reversal and isolation`);
  }
  // A shared customer must not earn a head-office voucher from branch turnover.
  const sharedClient = randomUUID(), couponId = randomUUID();
  await db.query('INSERT INTO clients(id,name,phone) VALUES($1,$2,$3)', [sharedClient, 'BRANCH_E2E_COUPON_CLIENT', 'E2E_' + sharedClient]);
  for (const companyId of [pair.head, pair.branch])
    await db.query('INSERT INTO company_clients(company_id,client_id) VALUES($1,$2)', [companyId, sharedClient]);
  const headBill = firstBillByCompany.get(pair.head), branchBill = firstBillByCompany.get(pair.branch);
  await db.query('UPDATE bills SET client_id=$1 WHERE id=ANY($2::text[])', [sharedClient, [headBill, branchBill]]);
  await db.query(`INSERT INTO coupons(id,code,type,company_id,audience_type,min_bill_amount,is_bill_combine,start_date,end_date,updated_at)
    VALUES($1,$2,'FLAT',$3,'GENERATE',200,true,now()-interval '1 day',now()+interval '1 day',now())`,
    [couponId, 'BRANCH_E2E_' + couponId, pair.head]);
  const generated = await generateCouponsForBill(db, { companyId: pair.head, clientId: sharedClient, billId: headBill, grandTotal: 118 });
  assert.deepEqual(generated, [], 'A company coupon must combine only its own company bills');
  results.push({ company: 'head', status: 'passed', check: 'combined-coupon-excludes-branch-turnover' });
} catch (error: any) {
  report.error = { name: error.name, statusCode: error.statusCode, message: error.statusMessage || error.message };
  process.exitCode = 1;
} finally {
  (pool as any).connect = originalConnect; (pool as any).query = originalQuery;
  (prisma.bill as any).findUnique = originalFind;
  stockRestores.forEach(restore => restore());
  await db.query('ROLLBACK');
  const remaining = await db.query('SELECT count(*)::int count FROM bills WHERE id=ANY($1::text[])', [[...own]]);
  assert.equal(remaining.rows[0].count, 0, 'All run-owned bills must roll back');
  report.cleanup = 'verified: all test bills and transaction effects rolled back';
  report.finishedAt = new Date().toISOString();
  writeFileSync('tests/branch-reports/billing-writes-followup.json', JSON.stringify(report, null, 2) + '\n');
  db.release(); await pool.end(); await prisma.$disconnect();
  console.log(report.error ? 'FAIL: see billing-writes-followup.json' : 'PASS: both-role billing write tests; rollback cleanup verified');
}
