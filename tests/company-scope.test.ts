import { appendCompanyWhere } from '../utils/companyWhere';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import { pool } from '../server/db';
import { transferGraph, executeCompanyTransfer } from '../server/utils/companyTransfer';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';
import { createEvent } from 'h3';
import { defineCompanyListHandler } from '../server/utils/companyListHandler';
import { prisma } from '../server/prisma';
import { getReadCompanyIds } from '../server/utils/organizationReadScope';

const sessionData = { companyId: 'head', id: 'admin', email: 'test@example.invalid' };
(globalThis as any).requireAuthSession = async () => ({ data: sessionData, update: () => { throw new Error('A filter must never update the session'); } });
function request(filter: string, ids = ['head', 'branch']) {
  const event = createEvent({ headers: { 'x-company-filter': filter }, url: '/api/test', method: 'GET' } as any, {} as any);
  event.context.authorizedCompanyIds = Promise.resolve(ids);
  return event;
}
assert.deepEqual(await getReadCompanyIds(request('*')), ['head', 'branch']);
assert.deepEqual(await getReadCompanyIds(request('head')), ['head']);
assert.deepEqual(await getReadCompanyIds(request('branch')), ['branch']);
await assert.rejects(getReadCompanyIds(request('outside')), /access denied/);
await assert.rejects(getReadCompanyIds(request('head', ['branch'])), /access denied/);
assert.equal(sessionData.companyId, 'head');

const calls: any[] = [];
const scoped = scopeOrganizationModelReads({ product: { findMany: async (args: any) => { calls.push(args); return []; } } }, 'head', ['head', 'branch']);
await scoped.product.findMany({ where: { companyId: 'head' } });
assert.equal(calls[0].where.companyId, 'head', 'an explicit head-office filter must not expand');
await scoped.product.findMany({ where: { companyId: { in: ['head', 'branch'] } } });
assert.deepEqual(calls[1].where.companyId.in, ['head', 'branch']);
assert.deepEqual(calls[1].where.AND.at(-1), { companyId: { in: ['head', 'branch'] } });
const writeCalls: any[] = [];
const fake: any = {
  product: {
    findUnique: async ({ where }: any) => ({ companyId: where.id === 'outside' ? 'outside' : 'head' }),
    update: async (args: any) => { writeCalls.push(args); return args; },
    create: async (args: any) => { writeCalls.push(args); return args; },
  },
  category: { findUnique: async () => ({ companyId: 'branch' }) },
  $transaction: async (run: any) => run(fake),
};
const guarded = scopeOrganizationModelReads(fake, 'head', ['head', 'branch']);
await assert.rejects(guarded.product.update({ where: { id: 'outside' }, data: { name: 'Denied' } }), /another company/);
await assert.rejects(guarded.product.update({ where: { id: 'inside' }, data: { companyId: 'branch' } }), /transfer/);
await assert.rejects(guarded.product.create({ data: { companyId: 'head', categoryId: 'branch-category' } }), /another company/);
await guarded.product.update({ where: { id: 'inside' }, data: { name: 'Allowed' } });
assert.equal(writeCalls.length, 1, 'unauthorized/mixed-company writes never reach the mutation');
let childQuery: any;
const scopedChildren = scopeOrganizationModelReads({ purchaseReturnItem: { findMany: async (args: any) => { childQuery = args; return []; } } }, 'head', ['head', 'branch']);
await scopedChildren.purchaseReturnItem.findMany({});
assert.deepEqual(childQuery.where.AND.at(-1), { purchaseReturn: { companyId: { in: ['head', 'branch'] } } }, 'companyless detail rows inherit their parent ownership');

const memberDb: any = {
  companyUser: {
    findMany: async () => [{ companyId: 'head', userId: 'admin', role: 'admin', status: true, deleted: false }],
    count: async () => 1,
    update: async () => { throw new Error('Last admin write reached database'); },
  },
  $queryRawUnsafe: async () => [],
  $transaction: async (run: any) => run(memberDb),
};
await assert.rejects(scopeOrganizationModelReads(memberDb, 'head', ['head']).companyUser.update({ where: { companyId_userId: { companyId: 'head', userId: 'admin' } }, data: { status: { set: false } } }), /active admin/);

const originalCompanies = prisma.company.findMany;
(prisma.company as any).findMany = async ({ where }: any) => where.id.in.map((id: string) => ({ id, name: id }));
try {
  const list = defineCompanyListHandler(async event => [{ userId: 'same-person', balance: event.context.requestCompanyId === 'head' ? 10 : 20 }]);
  const combined = await list(request('*'));
  assert.deepEqual(combined.map((row: any) => [row.scopeKey, row.balance]), [['head:same-person', 10], ['branch:same-person', 20]]);
  const branchOnly = await list(request('*', ['branch']));
  assert.equal(branchOnly.length, 1);
  assert.equal(branchOnly[0].companyId, 'branch');
  assert.equal(sessionData.companyId, 'head');
} finally { prisma.company.findMany = originalCompanies; }

// Exercise the real Prisma validator with the same AND-array shape as categories.
const categoryWhere = { AND: [{ name: { contains: '', mode: 'insensitive' } }, { OR: [{ status: true }, { status: false }] }] };
const scopedCategoryWhere = appendCompanyWhere(categoryWhere, { companyId: { in: [randomUUID(), randomUUID()] } });
assert.equal(scopedCategoryWhere.AND.length, 3);
assert.ok(scopedCategoryWhere.AND.every((clause: any) => !Array.isArray(clause)));
const categoryClient = scopeOrganizationModelReads(prisma, 'missing', ['missing']);
assert.equal(await categoryClient.category.count({ where: scopedCategoryWhere }), 0);
assert.deepEqual(await categoryClient.category.findMany({ where: scopedCategoryWhere, take: 1 }), []);
assert.equal(categoryWhere.AND.length, 2, 'adding scope must not mutate the page filter');

const db = await pool.connect();
const model = (name: string) => Prisma.dmmf.datamodel.models.find(m => m.name === name)!;
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
async function fixture(name: string, values: Record<string, any>) {
  const m = model(name);
  const data: Record<string, any> = {};
  for (const field of m.fields) {
    if (field.kind === 'object' || !field.isRequired || (field.hasDefaultValue && field.name !== 'id')) continue;
    data[field.name] = field.isList ? [] : field.kind === 'enum'
      ? Prisma.dmmf.datamodel.enums.find(e => e.name === field.type)!.values[0].name
      : field.type === 'DateTime' ? new Date() : field.type === 'Boolean' ? false
      : ['Float', 'Int', 'Decimal', 'BigInt'].includes(field.type) ? 0
      : field.type === 'Json' ? '{}' : field.name === 'id' ? randomUUID() : 'scope-test';
  }
  Object.assign(data, values);
  const entries = Object.entries(data);
  await db.query(`INSERT INTO ${quote(m.dbName || name)} (${entries.map(([key]) => quote(m.fields.find(f => f.name === key)!.dbName || key)).join(',')}) VALUES (${entries.map((_, i) => '$' + (i + 1)).join(',')})`, entries.map(([, value]) => value));
  return data.id as string;
}

try {
  await db.query('BEGIN');
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public';
  assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  const source = await fixture('Company', { name: 'Scope test source', type: 'retail', storecode: -Math.floor(Math.random() * 1000000000) });
  const destination = await fixture('Company', { name: 'Scope test destination', type: 'retail', storecode: -Math.floor(Math.random() * 1000000000) });
  const category = await fixture('Category', { companyId: source, name: 'Source category' });
  const targetCategory = await fixture('Category', { companyId: destination, name: 'Destination category' });
  const product = await fixture('Product', { companyId: source, categoryId: category, name: 'Source product' });
  const targetProduct = await fixture('Product', { companyId: destination, categoryId: targetCategory, name: 'Destination product' });
  const variant = await fixture('Variant', { companyId: source, productId: product, name: 'Source variant', sprice: 100 });
  const targetVariant = await fixture('Variant', { companyId: destination, productId: targetProduct, name: 'Destination variant', sprice: 100 });
  const item = await fixture('Item', { companyId: source, variantId: variant, qty: 9, initialQty: 10, soldQty: 1 });
  const targetItem = await fixture('Item', { companyId: destination, variantId: targetVariant, qty: 5, initialQty: 5, soldQty: 0 });
  const bill = await fixture('Bill', { companyId: source, grandTotal: 100, invoiceNumber: 1 });
  await fixture('Entry', { companyId: source, billId: bill, itemId: item, variantId: variant, categoryId: category, qty: 1, rate: 100, value: 100 });
  await fixture('AccountLedgerEntry', { companyId: source, accountType: 'CASH', direction: 'CREDIT', amount: 100, balanceAfter: 100, sourceType: 'BILL', sourceId: bill, entryDate: new Date() });
  const input = { model: 'Bill', id: bill, sourceCompanyId: source, companyId: destination };
  const preview = await transferGraph(db, input);
  assert.equal(preview.nodes.size, 2, 'bill and entry travel; old ledger stays archived');
  const mappings = { ['Item:' + item]: targetItem, ['Variant:' + variant]: targetVariant, ['Category:' + category]: targetCategory };
  const confirmed = { ...input, fingerprint: preview.fingerprint, includeLinked: true, mappings };
  await assert.rejects(executeCompanyTransfer(db, { ...confirmed, mappings: {} }), /Select a destination/);
  await db.query('SAVEPOINT no_stock');
  await db.query('UPDATE items SET qty=0 WHERE id=$1', [targetItem]);
  await assert.rejects(executeCompanyTransfer(db, confirmed), /stock is insufficient/);
  await db.query('ROLLBACK TO SAVEPOINT no_stock');
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1', [item])).rows[0].qty, 9, 'failed transfers roll back the source stock reversal');
  await db.query('SAVEPOINT stale');
  await db.query('UPDATE bills SET grand_total=101 WHERE id=$1', [bill]);
  await assert.rejects(executeCompanyTransfer(db, confirmed), /changed/);
  await db.query('ROLLBACK TO SAVEPOINT stale');
  const result = await executeCompanyTransfer(db, confirmed);
  assert.equal(result.moved, 2);
  assert.equal((await db.query('SELECT company_id FROM bills WHERE id=$1', [bill])).rows[0].company_id, destination);
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1', [item])).rows[0].qty, 10);
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1', [targetItem])).rows[0].qty, 4);
  const ledger = (await db.query('SELECT company_id, balance_after FROM account_ledger_entries WHERE source_id=$1', [bill])).rows[0];
  assert.equal(ledger.company_id, source);
  assert.equal(Number(ledger.balance_after), 100);
  const supplier = await fixture('Distributor', { name: 'Scope test supplier' });
  await fixture('DistributorCompany', { distributorId: supplier, companyId: source });
  const purchaseReturn = await fixture('PurchaseReturn', { distributorId: supplier, companyId: source, totalAmount: 50 });
  await fixture('PurchaseReturnItem', { purchaseReturnId: purchaseReturn, itemId: item, variantId: variant, categoryId: category, barcode: 'scope-test', qty: 2, rate: 25, subtotal: 50 });
  await db.query('UPDATE items SET qty=qty-2 WHERE id=$1', [item]);
  const returnInput = { model: 'PurchaseReturn', id: purchaseReturn, sourceCompanyId: source, companyId: destination };
  const returnPreview = await transferGraph(db, returnInput);
  await executeCompanyTransfer(db, { ...returnInput, fingerprint: returnPreview.fingerprint, mappings, includeLinked: true });
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1', [item])).rows[0].qty, 10);
  assert.equal((await db.query('SELECT qty FROM items WHERE id=$1', [targetItem])).rows[0].qty, 2);
  assert.equal((await db.query('SELECT count(*) FROM distributor_companies WHERE distributor_id=$1 AND company_id=$2', [supplier, destination])).rows[0].count, '1');
  const staff = await fixture('User', { email: randomUUID() + '@example.invalid' });
  await fixture('CompanyUser', { companyId: source, userId: staff, name: 'Transfer staff', role: 'user', status: true });
  await fixture('SalaryConfig', { companyId: source, userId: staff, amount: 500 });
  const payrollCycle = await fixture('PayrollCycle', { companyId: source, includeUserIds: [staff] });
  const payrollAdjustment = await fixture('PayrollAdjustment', { companyId: source, userId: staff, cycleId: payrollCycle, kind: 'ADDITION', amount: 25 });
  const payrollLine = await fixture('PayrollCycleLine', { companyId: source, cycleId: payrollCycle, userId: staff, netPay: 500 });
  const salaryMoney = await fixture('MoneyTransaction', { companyId: source, partyType: 'EMPLOYEE', direction: 'GIVEN', status: 'PAID', amount: 100, paymentMode: 'CASH' });
  const salaryPayment = await fixture('SalaryPayment', { companyId: source, userId: staff, amount: 100, moneyTransactionId: salaryMoney, cycleId: payrollCycle, cycleLineId: payrollLine });
  await fixture('AccountLedgerEntry', { companyId: source, accountType: 'CASH', direction: 'DEBIT', amount: 100, sourceType: 'MONEY_TRANSACTION', sourceId: salaryMoney, entryDate: new Date() });
  await fixture('UserLedgerEntry', { companyId: source, userId: staff, type: 'SALARY_PAYMENT', direction: 'DEBIT', amount: 100, sourceType: 'SALARY_PAYMENT', sourceId: salaryPayment });
  const staffInput = { model: 'CompanyUser', id: staff, sourceCompanyId: source, companyId: destination };
  const staffPreview = await transferGraph(db, staffInput);
  assert.ok(staffPreview.nodes.size >= 2);
  await executeCompanyTransfer(db, { ...staffInput, fingerprint: staffPreview.fingerprint, includeLinked: true });
  assert.equal((await db.query('SELECT company_id FROM salary_configs WHERE user_id=$1', [staff])).rows[0].company_id, destination);
  assert.equal((await db.query('SELECT count(*) FROM company_users WHERE company_id=$1 AND user_id=$2', [source, staff])).rows[0].count, '0');
  assert.equal((await db.query('SELECT company_id FROM money_transactions WHERE id=$1', [salaryMoney])).rows[0].company_id, destination);
  assert.equal((await db.query('SELECT company_id FROM account_ledger_entries WHERE source_id=$1', [salaryMoney])).rows[0].company_id, source, 'Salary source transfers preserve old ledger ownership');
  assert.equal((await db.query('SELECT company_id FROM payroll_cycles WHERE id=$1', [payrollCycle])).rows[0].company_id, destination);
  assert.equal((await db.query('SELECT company_id FROM user_ledger_entries WHERE source_id=$1', [salaryPayment])).rows[0].company_id, destination);
  assert.equal((await db.query('SELECT company_id FROM payroll_adjustments WHERE id=$1', [payrollAdjustment])).rows[0].company_id, destination);
  const capitalStaff = await fixture('User', { email: randomUUID() + '@example.invalid' });
  await fixture('CompanyUser', { companyId: source, userId: capitalStaff, name: 'Archived investor staff', role: 'user', status: true });
  const investment = await fixture('Investment', { companyId: source, userId: capitalStaff, direction: 'IN', amount: 1200, paymentMode: 'CASH', status: 'COMPLETED' });
  const capitalBefore = (await db.query('SELECT to_jsonb(i) value FROM investments i WHERE id=$1', [investment])).rows[0].value;
  const capitalInput = { model: 'CompanyUser', id: capitalStaff, sourceCompanyId: source, companyId: destination };
  const capitalGraph = await transferGraph(db, capitalInput);
  assert.ok(![...capitalGraph.nodes.values()].some(n => n.model === 'Investment'), 'Archived investment stays outside staff transfer graph');
  await executeCompanyTransfer(db, { ...capitalInput, fingerprint: capitalGraph.fingerprint, includeLinked: true });
  assert.deepEqual((await db.query('SELECT to_jsonb(i) value FROM investments i WHERE id=$1', [investment])).rows[0].value, capitalBefore);
  assert.deepEqual((await db.query('SELECT deleted,status FROM company_users WHERE company_id=$1 AND user_id=$2', [source, capitalStaff])).rows[0], { deleted: true, status: false });
  assert.equal((await db.query('SELECT count(*) FROM company_users WHERE company_id=$1 AND user_id=$2 AND NOT deleted', [destination, capitalStaff])).rows[0].count, '1');
  const customer = await fixture('Client', { phone: randomUUID() });
  await fixture('CompanyClient', { companyId: source, clientId: customer, points: 20 });
  await fixture('CompanyClient', { companyId: destination, clientId: customer, points: 5 });
  const clientInput = { model: 'CompanyClient', id: customer, sourceCompanyId: source, companyId: destination };
  const clientPreview = await transferGraph(db, clientInput);
  await executeCompanyTransfer(db, { ...clientInput, fingerprint: clientPreview.fingerprint, includeLinked: true });
  assert.equal(Number((await db.query('SELECT points FROM company_clients WHERE company_id=$1 AND client_id=$2', [destination, customer])).rows[0].points), 25);
  assert.equal((await db.query('SELECT count(*) FROM company_clients WHERE company_id=$1 AND client_id=$2', [source, customer])).rows[0].count, '0');
  const admin = await fixture('User', { email: randomUUID() + '@example.invalid' });
  await fixture('CompanyUser', { companyId: source, userId: admin, name: 'Only admin', role: 'admin', status: true });
  await assert.rejects(transferGraph(db, { ...staffInput, id: admin }), /active admin/);
  // Exercise payment + expense handlers inside the outer rolled-back fixture transaction.
  await fixture('ExpenseCategory', { name: 'Purchase', companyId: source });
  const originalConnect = pool.connect;
  const originalCompany = sessionData.companyId;
  (pool as any).connect = async () => ({
    query: (sql: string, args?: any[]) => db.query(sql === 'BEGIN' ? 'SAVEPOINT payment_handler'
      : sql === 'COMMIT' ? 'RELEASE SAVEPOINT payment_handler'
      : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT payment_handler' : sql, args),
    release: () => {},
  });
  sessionData.companyId = source;
  function paymentEvent(method: string, body: any, id?: string) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]) as any;
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(JSON.stringify(body))), 'x-company-id': source };
    req.url = '/api/distributor/payments' + (id ? '/' + id : ''); req.method = method;
    const event = createEvent(req, {} as any);
    event.context.authorizedCompanyIds = Promise.resolve([source, destination]);
    event.context.params = id ? { id } : {};
    return event;
  }
  try {
    const createPayment = (await import('../server/api/distributor/payments.post')).default;
    const updatePayment = (await import('../server/api/distributor/payments/[id].put')).default;
    const deletePayment = (await import('../server/api/distributor/payments/[id].delete')).default;
    const payment = await createPayment(paymentEvent('POST', { distributorId: supplier, amount: 25, paymentType: 'CASH', createExpense: true }));
    const linkedExpense = (await db.query('SELECT expense_id FROM distributor_payments WHERE id=$1', [payment.id])).rows[0].expense_id;
    assert.ok(linkedExpense);
    assert.equal((await db.query('SELECT count(*) FROM account_ledger_entries WHERE source_id=$1', [linkedExpense])).rows[0].count, '0');
    await updatePayment(paymentEvent('PUT', { amount: 35, paymentType: 'CASH' }, payment.id));
    assert.equal((await db.query('SELECT total_amount FROM expenses WHERE id=$1', [linkedExpense])).rows[0].total_amount, 35);
    assert.equal((await db.query('SELECT count(*) FROM account_ledger_entries WHERE source_id=$1', [linkedExpense])).rows[0].count, '0');
    await deletePayment(paymentEvent('DELETE', {}, payment.id));
    assert.equal((await db.query('SELECT count(*) FROM expenses WHERE id=$1', [linkedExpense])).rows[0].count, '0');
    assert.equal((await db.query('SELECT count(*) FROM account_ledger_entries WHERE source_id=$1', [linkedExpense])).rows[0].count, '0');
  } finally {
    (pool as any).connect = originalConnect;
    sessionData.companyId = originalCompany;
  }
  console.log('PASS request scopes, generated-write authorization, transfer mappings/rollback/stale previews, bill and purchase-return stock reconciliation, staff/client transfers including payroll and payment ledgers, last-admin protection, and linked payment/expense ledger CRUD');
} finally {
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
  await prisma.$disconnect();
}
