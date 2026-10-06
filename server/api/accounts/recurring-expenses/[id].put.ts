import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { pool } from '~/server/db';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { recurringExpenseInput } from '~/utils/recurring-expenses';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  let input;
  try { input = recurringExpenseInput(await readBody(event)); }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }); }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const record = await db.query('SELECT id FROM recurring_expenses WHERE id=$1 AND company_id=$2 FOR UPDATE', [getRouterParam(event, 'id'), session.data.companyId]);
    if (!record.rowCount) throw createError({ statusCode: 404, statusMessage: 'Schedule not found' });
    const category = await db.query('SELECT id FROM expense_categories WHERE id=$1 AND company_id=$2 FOR SHARE', [input.categoryId, session.data.companyId]);
    if (!category.rowCount) throw createError({ statusCode: 400, statusMessage: 'Select a category from this company' });
    const latest = await db.query('SELECT max(due_date)::text AS date FROM recurring_expense_occurrences WHERE schedule_id=$1', [getRouterParam(event, 'id')]);
    if (latest.rows[0].date && input.nextDueDate <= latest.rows[0].date) throw createError({ statusCode: 400, statusMessage: 'Next due date must be after the last generated occurrence' });
    await db.query(`UPDATE recurring_expenses SET category_id=$3,name=$4,note=$5,total_amount=$6,tax_amount=$7,
      recoverable_tax_amount=$8,next_due_date=$9::date,day_of_month=$10,active=$11,last_error=NULL,updated_at=now()
      WHERE id=$1 AND company_id=$2`, [getRouterParam(event, 'id'), session.data.companyId, input.categoryId,
      input.name, input.note || null, input.totalAmount, input.taxAmount, input.recoverableTaxAmount,
      input.nextDueDate, input.dayOfMonth, input.active]);
    await db.query('COMMIT');
    return { success: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
});
