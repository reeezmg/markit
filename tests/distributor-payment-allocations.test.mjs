import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const source = ts.transpileModule(readFileSync('server/utils/distributor-payment-save.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
let body, calls, saved, transaction, failAllocation = false, foreignOrder = false, posting = [];
const db = { release() {}, async query(sql, args = []) {
  calls.push({ sql, args });
  const result = rows => ({ rows, rowCount: rows.length });
  if (sql === 'BEGIN') { transaction = structuredClone(saved); return result([]); }
  if (sql === 'ROLLBACK') { saved = transaction; return result([]); }
  if (sql.startsWith('SELECT id,expense_id,distributor_id')) return result(saved.payment ? [saved.payment] : []);
  if (sql.startsWith('SELECT 1 FROM distributor_companies')) return result([{}]);
  if (sql.startsWith('SELECT 1 FROM distributor_payment_allocations')) return result(saved.allocations.length ? [{}] : []);
  if (sql.startsWith('SELECT id,total_amount')) return result(foreignOrder ? [] : args[2].map(id => ({ id, total_amount: id === 'po1' ? 100 : 200, payment_type: 'CREDIT', due_cleared: false })));
  if (sql.startsWith('SELECT purchase_order_id,sum')) return result([{ purchase_order_id: 'po1', amount: 20 }]);
  if (sql.startsWith('SELECT id FROM expense_categories')) return result([{ id: 'purchase' }]);
  if (sql.startsWith('UPDATE companies')) return result([{ number: 10 }]);
  if (sql.startsWith('INSERT INTO expenses')) { saved.expense = { id: args[0], amount: args[4] }; return result([]); }
  if (sql.startsWith('UPDATE expenses')) { saved.expense.amount = args[2]; return result([{ id: args[0] }]); }
  if (sql.startsWith('INSERT INTO distributor_payments')) { saved.payment = { id: args[0], amount: args[3], distributor_id: args[7], purchase_order_id: args[9], expense_id: args[10] }; return result([]); }
  if (sql.startsWith('UPDATE distributor_payments')) { saved.payment.amount = args[2]; saved.payment.purchase_order_id = args[6]; return result([]); }
  if (sql.startsWith('DELETE FROM distributor_payment_allocations')) { saved.allocations = []; return result([]); }
  if (sql.startsWith('INSERT INTO distributor_payment_allocations')) {
    if (failAllocation) throw Error('allocation write failed');
    saved.allocations.push({ paymentId: args[2], purchaseOrderId: args[3], amount: args[4] }); return result([]);
  }
  if (sql === 'COMMIT' || sql.includes('pg_advisory_xact_lock')) return result([]);
  throw Error('Unhandled SQL: ' + sql);
} };
const { paymentParts, saveDistributorPayment } = new Function('readBody', 'createError', 'crypto', 'pool', 'useCompanyRequestSession', 'lockCompanyRequest', 'selectDistributorAccounts', source + '\nreturn {paymentParts,saveDistributorPayment};')(
  async () => body, ({ statusMessage }) => Error(statusMessage), crypto, { connect: async () => db }, async () => ({ data: { companyId: 'company' } }), async () => {}, async (...args) => { posting.push(args); },
);
const original = { distributorId: 'vendor', amount: 150, createExpense: true, paymentType: 'BANK', allocations: [{ purchaseOrderId: 'po1', amount: 80 }, { purchaseOrderId: 'po2', amount: 70 }] };
for (const invalid of [
  { ...original, amount: 151 },
  { ...original, allocations: [{ purchaseOrderId: 'po1', amount: 75 }, { purchaseOrderId: 'po1', amount: 75 }] },
  { ...original, allocations: [{ purchaseOrderId: 'po1', amount: -1 }] },
  { ...original, amount: 0.001 },
]) assert.throws(() => paymentParts(invalid));
assert.deepEqual(paymentParts({ amount: 100, purchaseOrderId: 'po1' }), [{ purchaseOrderId: 'po1', amount: 100 }]);
function reset() { saved = { payment: null, expense: null, allocations: [] }; calls = []; posting = []; foreignOrder = false; failAllocation = false; body = structuredClone(original); }
reset();
const created = await saveDistributorPayment({});
assert.equal(saved.payment.amount, 150);
assert.equal(saved.expense.amount, 150);
assert.equal(saved.payment.purchase_order_id, null);
assert.equal(saved.allocations.length, 2);
assert.ok(saved.allocations.every(a => a.paymentId === created.id));
assert.equal(calls.filter(c => c.sql.startsWith('INSERT INTO distributor_payments')).length, 1, 'One payment record, not split payments');
assert.equal(posting.length, 1, 'Accounting selection and source posting use the complete payment once');
body = { ...original, allocations: [{ purchaseOrderId: 'po1', amount: 50 }, { purchaseOrderId: 'po2', amount: 100 }] };
await saveDistributorPayment({}, created.id);
assert.deepEqual(saved.allocations.map(a => a.amount), [50, 100]);
assert.equal(saved.payment.id, created.id);
body = { ...original }; delete body.allocations;
await assert.rejects(saveDistributorPayment({}, created.id), /preserve/);
body = { ...original, allocations: [] };
await saveDistributorPayment({}, created.id);
assert.equal(saved.allocations.length, 0, 'Explicitly clearing links preserves the payment and expense');
assert.equal(saved.payment.amount, 150);
reset(); body.allocations[0].amount = 90; body.allocations[1].amount = 60;
await assert.rejects(saveDistributorPayment({}), /exceeds/);
assert.equal(saved.payment, null);
reset(); foreignOrder = true;
await assert.rejects(saveDistributorPayment({}), /belong/);
assert.equal(saved.payment, null);
reset(); failAllocation = true;
await assert.rejects(saveDistributorPayment({}), /write failed/);
assert.deepEqual(saved, { payment: null, expense: null, allocations: [] }, 'Failure rolls back payment, expense and allocations together');
const helper = ts.transpileModule(readFileSync('utils/purchase-order-payments.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
const purchaseOrderPayments = new Function(helper + '\nreturn purchaseOrderPayments;')();
const po = { totalAmount: 100, distributorPayment: [{ id: 'old', amount: 20 }], paymentAllocations: [{ amount: 80, payment: { id: 'shared', amount: 150 } }] };
assert.equal(purchaseOrderPayments(po).reduce((sum, p) => sum + p.amount, 0), 100, 'PO due counts its 80 allocation plus 20 legacy, not the parent payment of 150');
assert.equal(purchaseOrderPayments({ paymentAllocations: [{ amount: 70, payment: { id: 'shared', amount: 150 } }] })[0].amount, 70);
for (const file of ['pages/distributor/payments.vue', 'pages/distributor/purchaseOrder.vue', 'pages/distributor/index.vue']) {
  const { descriptor, errors } = parse(readFileSync(file, 'utf8'), { filename: file });
  assert.deepEqual(errors, []);
  compileScript(descriptor, { id: file });
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: file }).errors, []);
}
console.log('Payment allocations passed: one payment/expense, multiple PO amounts, edit/unlink, ownership, overpayment and atomic rollback. Vue forms compile. No database used.');
