// ~/server/api/expenses.get.ts
import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyId = session.data.companyId;
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });

  const query = getQuery(event);
  const startDate = query.startDate ? new Date(JSON.parse(query.startDate)) : new Date(0);
  const endDate = query.endDate ? new Date(JSON.parse(query.endDate)) : new Date();

  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT 
        e.created_at AS "createdAt",
        e.note,
        e.total_amount AS amount,
        ec.name AS categoryName
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.expense_category_id = ec.id
      WHERE e.company_id = $1
        AND e.expense_date BETWEEN $2 AND $3
      ORDER BY e.expense_date DESC;
      `,
      [companyId, startDate, endDate]
    );

    return res.rows.map(r => ({
      date: r.createdAt,
      note: r.note,
      amount: Number(r.amount),
      name: r.categoryname
    }));
  } finally {
    client.release();
  }
});
