import { randomUUID } from 'node:crypto';
import { createError, defineEventHandler, readBody } from 'h3';
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
    const category = await db.query('SELECT id FROM expense_categories WHERE id=$1 AND company_id=$2 FOR SHARE', [input.categoryId, session.data.companyId]);
    if (!category.rowCount) throw createError({ statusCode: 400, statusMessage: 'Select a category from this company' });
    const id = randomUUID();
    await db.query(`INSERT INTO recurring_expenses(id,company_id,category_id,name,note,total_amount,tax_amount,
      recoverable_tax_amount,next_due_date,day_of_month,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11)`,
    [id, session.data.companyId, input.categoryId, input.name, input.note || null, input.totalAmount,
      input.taxAmount, input.recoverableTaxAmount, input.nextDueDate, input.dayOfMonth, input.active]);
    await db.query('COMMIT');
    return { id };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
});
