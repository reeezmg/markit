import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createError, createEvent, defineEventHandler, getHeader, getQuery, getRequestURL, readBody } from 'h3';
import { pool } from '../server/db';

const REEZC = '5271d5cb-2e97-4303-85c0-3fc9e3e6bb05';
const PUTTUR = 'cbbc74af-a72c-47a0-b92e-18af76d32221';
const MARKIT = '02856c86-60b8-41a4-ba18-79dbd55bf016';
const ADMIN = 'de505401-800f-4560-aba2-00571ea30e7c';

let sessionData: any = { companyId: REEZC, id: ADMIN, email: 'erp-scope-test@example.invalid', role: 'admin' };
(globalThis as any).requireAuthSession = async () => ({ data: sessionData });
(globalThis as any).useAuthSession = async () => ({ data: sessionData });
Object.assign(globalThis, { createError, defineEventHandler, getHeader, getQuery, getRequestURL, readBody });

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
  return event;
}

const companyFixtures = [
  { id: REEZC, name: 'reezc', categoryId: '5647543c-c1a5-4f9b-8b32-1f47211d7bbf', expenseCategoryId: 'b149d458-d058-488a-b27d-1ac1360def7d', authorized: [REEZC, PUTTUR] },
  { id: PUTTUR, name: 'puttur', categoryId: '48356397-0eea-4713-8adc-7fc9a62ff1dc', expenseCategoryId: '4e71eb10-1994-406f-84ef-8471f3c22ad9', authorized: [REEZC, PUTTUR] },
  { id: MARKIT, name: 'Markit', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', expenseCategoryId: '76276361-6419-4d81-8149-1c17be4ec4f3', authorized: [MARKIT] },
];

const createdBillIds: string[] = [];
const createdExpenseIds: string[] = [];
const createdAccountIds: string[] = [];
const db = await pool.connect();
try {
  const companyMiddleware = (await import('../server/middleware/company-request')).default as any;
  const createBill = (await import('../server/api/bill/create.post')).default as any;
  const listBills = (await import('../server/api/billSale/findManyBills.post')).default as any;
  const createExpense = (await import('../server/api/accounts/expenses.post')).default as any;
  const listExpenses = (await import('../server/api/accounts/expenses.get')).default as any;
  const createAccount = (await import('../server/api/bill/createAccount.post')).default as any;
  const findUniqueBill = (await import('../server/api/billEdit/findUniqueBill.get')).default as any;
  const onlineReport = (await import('../server/api/report/online.get')).default as any;

  for (const fixture of companyFixtures) {
    sessionData = { ...sessionData, companyId: fixture.id, role: fixture.id === REEZC ? 'admin' : 'manager' };
    const billId = randomUUID();
    const amount = fixture.id === REEZC ? 101 : fixture.id === PUTTUR ? 102 : 103;
    const body = {
      uuid: billId,
      companyId: fixture.id,
      userId: ADMIN,
      billPoints: 0,
      returnedItems: [],
      items: [{ name: `ERP scope ${fixture.name}`, qty: 1, rate: amount, value: amount, category: [{ id: fixture.categoryId }] }],
      payload: {
        subtotal: amount,
        discount: 0,
        discountType: 'percentage',
        grandTotal: amount,
        returnAmt: 0,
        paymentMethod: 'Cash',
        paymentStatus: 'PAID',
        type: 'BILL',
        createdAt: new Date().toISOString(),
        company: { connect: { id: fixture.id } },
        companyUser: { connect: { companyId_userId: { companyId: fixture.id, userId: ADMIN } } },
        entries: { create: [{ name: `ERP scope ${fixture.name}`, qty: 1, rate: amount, discount: 0, tax: 0, value: amount, return: false, category: { connect: { id: fixture.categoryId } } }] },
      },
    };
    const event = eventFor('POST', '/api/bill/create', body, fixture.id, fixture.authorized);
    await companyMiddleware(event);
    const result = await createBill(event);
    createdBillIds.push(billId);
    assert.equal(result.billId, billId);

    const stored = await db.query(
      `SELECT b.company_id, b.grand_total, e.company_id AS entry_company_id, e.category_id
       FROM bills b JOIN entries e ON e.bill_id=b.id WHERE b.id=$1`,
      [billId],
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].company_id, fixture.id);
    assert.equal(stored.rows[0].entry_company_id, fixture.id);
    assert.equal(stored.rows[0].category_id, fixture.categoryId);
    assert.equal(Number(stored.rows[0].grand_total), amount);

    const expenseBody = {
      companyId: fixture.id,
      expenseDate: new Date().toISOString(),
      expensecategoryId: fixture.expenseCategoryId,
      userId: ADMIN,
      totalAmount: amount,
      paymentMode: 'CASH',
      status: 'Pending',
      note: `ERP scope ${fixture.name}`,
    };
    const expenseEvent = eventFor('POST', '/api/accounts/expenses', expenseBody, fixture.id, fixture.authorized);
    await companyMiddleware(expenseEvent);
    const expenseResult = await createExpense(expenseEvent);
    createdExpenseIds.push(expenseResult.id);
    const storedExpense = await db.query('SELECT company_id, expense_category_id, from_id, total_amount FROM expenses WHERE id=$1', [expenseResult.id]);
    assert.equal(storedExpense.rows[0].company_id, fixture.id);
    assert.equal(storedExpense.rows[0].expense_category_id, fixture.expenseCategoryId);
    assert.equal(storedExpense.rows[0].from_id, ADMIN);
    assert.equal(Number(storedExpense.rows[0].total_amount), amount);

    const accountBody = { companyId: fixture.id, name: `ERP scope ${fixture.name} ${billId.slice(0, 8)}`, phone: `90000${amount}`, address: { city: 'Scope test' } };
    const accountEvent = eventFor('POST', '/api/bill/createAccount', accountBody, fixture.id, fixture.authorized);
    await companyMiddleware(accountEvent);
    const accountResult = await createAccount(accountEvent);
    createdAccountIds.push(accountResult.id);
    const storedAccount = await db.query('SELECT company_id, name FROM accounts WHERE id=$1', [accountResult.id]);
    assert.equal(storedAccount.rows[0].company_id, fixture.id);
  }

  sessionData = { ...sessionData, companyId: REEZC, role: 'admin' };
  const listBody = { companyId: REEZC, search: '', page: 1, pageCount: 500, sortColumn: 'createdAt', sortDirection: 'desc' };
  const allStores = await listBills(eventFor('POST', '/api/billSale/findManyBills', listBody, REEZC, [REEZC, PUTTUR], '*'));
  const allIds = new Set(allStores.rows.map((row: any) => row.id));
  assert.ok(allIds.has(createdBillIds[0]), 'head-office Sales view must include the head-office bill');
  assert.ok(allIds.has(createdBillIds[1]), 'head-office Sales view must include the branch bill');
  assert.ok(!allIds.has(createdBillIds[2]), 'head-office Sales view must exclude the standalone Markit bill');

  const branchOnly = await listBills(eventFor('POST', '/api/billSale/findManyBills', { ...listBody, companyId: PUTTUR }, PUTTUR, [REEZC, PUTTUR], PUTTUR));
  const branchIds = new Set(branchOnly.rows.map((row: any) => row.id));
  assert.ok(branchIds.has(createdBillIds[1]));
  assert.ok(!branchIds.has(createdBillIds[0]));

  sessionData = { ...sessionData, companyId: MARKIT, role: 'manager' };
  const markitOnly = await listBills(eventFor('POST', '/api/billSale/findManyBills', { ...listBody, companyId: MARKIT }, MARKIT, [MARKIT], '*'));
  const markitIds = new Set(markitOnly.rows.map((row: any) => row.id));
  assert.ok(markitIds.has(createdBillIds[2]));
  assert.ok(!markitIds.has(createdBillIds[0]));
  assert.ok(!markitIds.has(createdBillIds[1]));

  sessionData = { ...sessionData, companyId: REEZC, role: 'admin' };
  const branchBill = await findUniqueBill(eventFor('GET', `/api/billEdit/findUniqueBill?billId=${createdBillIds[1]}`, null, REEZC, [REEZC, PUTTUR]));
  assert.equal(branchBill.id, createdBillIds[1], 'head-office edit page must open an authorized branch bill');
  await assert.rejects(
    findUniqueBill(eventFor('GET', `/api/billEdit/findUniqueBill?billId=${createdBillIds[2]}`, null, REEZC, [REEZC, PUTTUR])),
    (error: any) => error?.statusCode === 404,
  );

  sessionData = { ...sessionData, companyId: MARKIT, role: 'manager' };
  const markitBill = await findUniqueBill(eventFor('GET', `/api/billEdit/findUniqueBill?billId=${createdBillIds[2]}`, null, MARKIT, [MARKIT]));
  assert.equal(markitBill.id, createdBillIds[2]);
  await assert.rejects(
    findUniqueBill(eventFor('GET', `/api/billEdit/findUniqueBill?billId=${createdBillIds[0]}`, null, MARKIT, [MARKIT])),
    (error: any) => error?.statusCode === 404,
  );

  await db.query('UPDATE bills SET is_markit=true WHERE id = ANY($1::text[])', [createdBillIds]);
  sessionData = { ...sessionData, companyId: REEZC, role: 'admin', cleanup: false };
  const onlineAll = await listBills(eventFor('POST', '/api/billSale/findManyBills', { ...listBody, isMarkitOnly: true }, REEZC, [REEZC, PUTTUR], '*'));
  const onlineAllIds = new Set(onlineAll.rows.map((row: any) => row.id));
  assert.ok(onlineAllIds.has(createdBillIds[0]));
  assert.ok(onlineAllIds.has(createdBillIds[1]));
  assert.ok(!onlineAllIds.has(createdBillIds[2]));
  const reezcOnlineReport = await onlineReport(eventFor('GET', '/api/report/online', null, REEZC, [REEZC, PUTTUR], '*'));
  assert.ok(reezcOnlineReport.totalSales >= 203, 'online report must include the head-office and branch test bills');

  sessionData = { ...sessionData, companyId: MARKIT, role: 'manager', cleanup: false };
  const markitOnline = await listBills(eventFor('POST', '/api/billSale/findManyBills', { ...listBody, companyId: MARKIT, isMarkitOnly: true }, MARKIT, [MARKIT], '*'));
  const markitOnlineIds = new Set(markitOnline.rows.map((row: any) => row.id));
  assert.ok(markitOnlineIds.has(createdBillIds[2]));
  assert.ok(!markitOnlineIds.has(createdBillIds[0]));
  const markitOnlineReport = await onlineReport(eventFor('GET', '/api/report/online', null, MARKIT, [MARKIT], '*'));
  assert.ok(markitOnlineReport.totalSales >= 103, 'normal-company online report must include its own test bill');

  sessionData = { ...sessionData, companyId: REEZC, role: 'admin' };
  const expenseQuery = '?page=1&pageCount=500&sortColumn=expenseDate&sortDirection=desc';
  const allExpenses = await listExpenses(eventFor('GET', `/api/accounts/expenses${expenseQuery}`, null, REEZC, [REEZC, PUTTUR], '*'));
  const allExpenseIds = new Set(allExpenses.rows.map((row: any) => row.id));
  assert.ok(allExpenseIds.has(createdExpenseIds[0]));
  assert.ok(allExpenseIds.has(createdExpenseIds[1]));
  assert.ok(!allExpenseIds.has(createdExpenseIds[2]));

  const branchExpenses = await listExpenses(eventFor('GET', `/api/accounts/expenses${expenseQuery}`, null, PUTTUR, [REEZC, PUTTUR], PUTTUR));
  const branchExpenseIds = new Set(branchExpenses.rows.map((row: any) => row.id));
  assert.ok(branchExpenseIds.has(createdExpenseIds[1]));
  assert.ok(!branchExpenseIds.has(createdExpenseIds[0]));

  sessionData = { ...sessionData, companyId: MARKIT, role: 'manager' };
  const markitExpenses = await listExpenses(eventFor('GET', `/api/accounts/expenses${expenseQuery}`, null, MARKIT, [MARKIT], '*'));
  const markitExpenseIds = new Set(markitExpenses.rows.map((row: any) => row.id));
  assert.ok(markitExpenseIds.has(createdExpenseIds[2]));
  assert.ok(!markitExpenseIds.has(createdExpenseIds[0]));
  assert.ok(!markitExpenseIds.has(createdExpenseIds[1]));

  sessionData = { ...sessionData, companyId: REEZC, role: 'admin' };
  const mixedBody = {
    uuid: randomUUID(), companyId: PUTTUR, userId: ADMIN, billPoints: 0, returnedItems: [], items: [],
    payload: {
      company: { connect: { id: PUTTUR } },
      companyUser: { connect: { companyId_userId: { companyId: PUTTUR, userId: ADMIN } } },
      entries: { create: [{ name: 'invalid mixed company', qty: 1, rate: 1, value: 1, category: { connect: { id: companyFixtures[0].categoryId } } }] },
    },
  };
  await assert.rejects(
    companyMiddleware(eventFor('POST', '/api/bill/create', mixedBody, PUTTUR, [REEZC, PUTTUR])),
    (error: any) => error?.statusCode === 403 && /another company/.test(error?.statusMessage || ''),
  );

  console.log('PASS all ERP page groups: billing, sales, bill edit, online sales, expenses, and B2B accounts for reezc, puttur branch, and Markit; combined/filter isolation and mixed-company rejection');
} finally {
  if (createdAccountIds.length) {
    await db.query('DELETE FROM addresses WHERE account_id = ANY($1::text[])', [createdAccountIds]);
    await db.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [createdAccountIds]);
  }
  if (createdExpenseIds.length) {
    await db.query('DELETE FROM account_ledger_entries WHERE source_id = ANY($1::text[])', [createdExpenseIds]);
    await db.query('DELETE FROM expenses WHERE id = ANY($1::text[])', [createdExpenseIds]);
  }
  if (createdBillIds.length) {
    await db.query('DELETE FROM account_ledger_entries WHERE source_id = ANY($1::text[])', [createdBillIds]);
    await db.query('DELETE FROM entries WHERE bill_id = ANY($1::text[])', [createdBillIds]);
    await db.query('DELETE FROM bills WHERE id = ANY($1::text[])', [createdBillIds]);
  }
  db.release();
  await pool.end();
}
