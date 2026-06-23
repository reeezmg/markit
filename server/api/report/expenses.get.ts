// ~/server/api/expenses.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)

  const startDate = query.startDate
    ? new Date(query.startDate as string)
    : new Date(0)

  const endDate = query.endDate
    ? new Date(query.endDate as string)
    : new Date()



  const client = await pool.connect()
  try {
    const res = await client.query(
      `
      SELECT
        e.created_at AS "createdAt",
        e.note,
        e.total_amount AS "totalAmount",
        ec.name AS "categoryName",
        cu.name AS "userName"
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.expense_category_id = ec.id
      LEFT JOIN company_users cu ON cu.company_id = e.company_id AND cu.user_id = e.from_id
      WHERE e.company_id = $1
        AND e.expense_date BETWEEN $2 AND $3
      ORDER BY e.expense_date DESC;
      `,
      [companyId, startDate, endDate]
    )

    // ✅ Transform to match your expected structure
    return res.rows.map((r) => ({
      createdAt: r.createdAt,
      note: r.note,
      totalAmount: Number(r.totalAmount),
      userName: r.userName || '',
      expensecategory: {
        name: r.categoryName,
      },
    }))
  } finally {
    client.release()
  }
})
