import { expenseTaxAmounts } from './expense-tax';

export function validExpenseDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= '2000-01-01' && value <= '2100-12-31';
}

/** Retain the original day, so Jan 31 -> Feb 28 -> Mar 31. */
export function nextExpenseMonth(date: string, day: number) {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function indiaExpenseDate(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function recurringExpenseInput(body: any) {
  if (!body || typeof body !== 'object') throw new Error('Expense details are required');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) throw new Error('Name must contain 1 to 120 characters');
  if (typeof body.categoryId !== 'string' || !body.categoryId) throw new Error('Select an expense category');
  if (!validExpenseDate(body.nextDueDate)) throw new Error('Select a valid next due date');
  const dayOfMonth = Number(body.dayOfMonth);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new Error('Monthly day must be between 1 and 31');
  const lastDay = new Date(Date.UTC(Number(body.nextDueDate.slice(0, 4)), Number(body.nextDueDate.slice(5, 7)), 0)).getUTCDate();
  if (Number(body.nextDueDate.slice(8)) !== Math.min(dayOfMonth, lastDay)) throw new Error('Next due date must match the monthly day (or the last day of a shorter month)');
  const totalAmount = Number(body.totalAmount);
  const tax = expenseTaxAmounts(totalAmount, body.taxAmount, body.recoverableTaxAmount);
  if (totalAmount <= 0) throw new Error('Amount must be positive');
  if (typeof body.active !== 'boolean') throw new Error('Invalid schedule status');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 350) throw new Error('Note must be at most 350 characters');
  return { name, categoryId: body.categoryId, nextDueDate: body.nextDueDate, dayOfMonth,
    totalAmount, ...tax, active: body.active, note };
}
