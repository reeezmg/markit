import { pool } from '~/server/db'
import { ensureEcommFeedbackTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await ensureEcommFeedbackTable()

  const { rows } = await pool.query(
    `
      SELECT f.id,
             f.client_id AS "clientId",
             COALESCE(c.name, f.customer_name) AS "customerName",
             c.email AS "clientEmail",
             c.phone AS "clientPhone",
             f.title,
             f.message,
             f.rating,
             f.sort_order AS "sortOrder",
             f.status,
             f.created_at AS "createdAt",
             f.updated_at AS "updatedAt"
      FROM ecomm_feedback f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.company_id = $1
      ORDER BY f.sort_order ASC, f.created_at ASC
    `,
    [session.data.companyId]
  )

  return rows
})
