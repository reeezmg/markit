import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { indiaExpenseDate, nextExpenseMonth } from '../../utils/recurring-expenses';

/** One occurrence, counter and all deferred accounting triggers commit together. */
export async function processRecurringExpenses(pool: Pool, companyId: string | null = null) {
  const today = indiaExpenseDate();
  const deadline = Date.now() + 40_000;
  const result = { created: 0, failed: 0, remaining: 0 };
  const failedIds: string[] = [];
  for (let i = 0; i < 200 && Date.now() < deadline; i++) {
    const db = await pool.connect();
    let scheduleId: string | undefined;
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout = '8s'");
      await db.query("SET LOCAL lock_timeout = '3s'");
      const { rows } = await db.query(`SELECT r.*, r.next_due_date::text AS due_date
        FROM recurring_expenses r JOIN companies c ON c.id=r.company_id
        WHERE r.active AND c.status AND r.next_due_date <= $1::date
          AND ($2::text IS NULL OR r.company_id=$2) AND NOT (r.id=ANY($3::text[]))
        ORDER BY r.next_due_date, r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`, [today, companyId, failedIds]);
      const row = rows[0];
      if (!row) { await db.query('ROLLBACK'); break; }
      scheduleId = row.id;
      // A category can be transferred after a schedule is saved. Recheck and lock it.
      const category = await db.query('SELECT id FROM expense_categories WHERE id=$1 AND company_id=$2 FOR SHARE', [row.category_id, row.company_id]);
      if (!category.rowCount) throw new Error('Expense category no longer belongs to this company');
      const occurrenceId = randomUUID();
      const claimed = await db.query(`INSERT INTO recurring_expense_occurrences(id,schedule_id,due_date)
        VALUES($1,$2,$3::date) ON CONFLICT(schedule_id,due_date) DO NOTHING RETURNING id`, [occurrenceId, row.id, row.due_date]);
      if (claimed.rowCount) {
        const expenseId = randomUUID();
        const counter = await db.query(`UPDATE companies SET expense_counter=expense_counter+1 WHERE id=$1
          RETURNING expense_counter-1 AS number, currency`, [row.company_id]);
        // Pending entries do not move cash. Existing ERP database triggers post accruals.
        await db.query(`INSERT INTO expenses(id,company_id,expense_category_id,expense_number,expense_date,
          note,currency,payment_mode,status,total_amount,tax_amount,recoverable_tax_amount,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5::date,$6,$7,'CASH','Pending',$8,$9,$10,now(),now())`,
        [expenseId, row.company_id, row.category_id, counter.rows[0].number, row.due_date,
          `${row.name}${row.note ? ': ' + row.note : ''}`, counter.rows[0].currency || 'INR',
          row.total_amount, row.tax_amount, row.recoverable_tax_amount]);
        await db.query('UPDATE recurring_expense_occurrences SET expense_id=$1 WHERE id=$2', [expenseId, occurrenceId]);
      }
      await db.query(`UPDATE recurring_expenses SET next_due_date=$1::date,last_error=NULL,updated_at=now() WHERE id=$2`,
        [nextExpenseMonth(row.due_date, row.day_of_month), row.id]);
      await db.query('COMMIT');
      if (claimed.rowCount) result.created++;
    } catch (error) {
      await db.query('ROLLBACK');
      if (!scheduleId) throw error;
      failedIds.push(scheduleId);
      result.failed++;
      // Do not expose SQL internals in the UI. Failed dates stay due for the next run.
      console.error('Recurring expense generation failed', scheduleId, error);
      await db.query(`UPDATE recurring_expenses SET last_error=$1,updated_at=now() WHERE id=$2`,
        ['Could not generate this expense. Check its category and accounting period, then retry.', scheduleId]);
    } finally { db.release(); }
  }
  const pending = await pool.query(`SELECT count(*)::int AS count FROM recurring_expenses r
    JOIN companies c ON c.id=r.company_id WHERE r.active AND c.status AND r.next_due_date <= $1::date
    AND ($2::text IS NULL OR r.company_id=$2)`, [today, companyId]);
  result.remaining = pending.rows[0].count;
  return result;
}
