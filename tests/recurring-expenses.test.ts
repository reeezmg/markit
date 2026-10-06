import assert from 'node:assert/strict';
import { indiaExpenseDate, nextExpenseMonth, recurringExpenseInput, validExpenseDate } from '../utils/recurring-expenses';

assert.equal(nextExpenseMonth('2026-01-31', 31), '2026-02-28');
assert.equal(nextExpenseMonth('2026-02-28', 31), '2026-03-31');
assert.equal(nextExpenseMonth('2028-01-31', 31), '2028-02-29');
assert.equal(nextExpenseMonth('2026-12-15', 15), '2027-01-15');
assert.equal(indiaExpenseDate(new Date('2026-09-29T18:30:00Z')), '2026-09-30');
assert.equal(validExpenseDate('2026-02-30'), false);
const valid = { name: 'Rent', categoryId: 'rent', totalAmount: 118, taxAmount: 18,
  recoverableTaxAmount: 0, nextDueDate: '2026-02-28', dayOfMonth: 31, active: true };
assert.equal(recurringExpenseInput(valid).recoverableTaxAmount, 0);
for (const change of [{ totalAmount: Infinity }, { totalAmount: -10 }, { totalAmount: 1.001 },
  { taxAmount: 119 }, { recoverableTaxAmount: 19 }, { recoverableTaxAmount: null },
  { dayOfMonth: 0 }, { dayOfMonth: 15 }, { nextDueDate: '2026-02-31' }, { active: 'false' }]) {
  assert.throws(() => recurringExpenseInput({ ...valid, ...change }));
}
console.log('Recurring expense validation and calendar tests passed');
