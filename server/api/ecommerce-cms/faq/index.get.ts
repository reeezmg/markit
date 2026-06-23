import { pool } from '~/server/db'
import { ensureEcommFaqsTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await ensureEcommFaqsTable()

  const { rows } = await pool.query(
    `
      SELECT id, question, answer, sort_order AS "sortOrder", status,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM ecomm_faqs
      WHERE company_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `,
    [session.data.companyId]
  )

  return rows
})
