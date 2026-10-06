import { defineEventHandler } from 'h3';
import { pool } from '~/server/db';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event);
  const { rows } = await pool.query(`SELECT r.id,r.name,r.note,r.category_id AS "categoryId",
    c.name AS "categoryName",r.total_amount AS "totalAmount",r.tax_amount AS "taxAmount",
    r.recoverable_tax_amount AS "recoverableTaxAmount",r.next_due_date::text AS "nextDueDate",
    r.day_of_month AS "dayOfMonth",r.active,r.last_error AS "lastError"
    FROM recurring_expenses r LEFT JOIN expense_categories c ON c.id=r.category_id AND c.company_id=r.company_id
    WHERE r.company_id=$1 ORDER BY r.active DESC,r.next_due_date,r.name`, [session.data.companyId]);
  return rows;
});
