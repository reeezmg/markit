import { pool } from '~/server/db'
import { ensureEcommFaqsTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{
    question?: string
    answer?: string
    sortOrder?: number
    status?: boolean
  }>(event)

  if (!body.question?.trim() || !body.answer?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Question and answer are required' })
  }

  await ensureEcommFaqsTable()

  const { rows } = await pool.query(
    `
      INSERT INTO ecomm_faqs (company_id, question, answer, sort_order, status)
      VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, TRUE))
      RETURNING id, question, answer, sort_order AS "sortOrder", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [
      session.data.companyId,
      body.question.trim(),
      body.answer.trim(),
      body.sortOrder ?? 0,
      body.status ?? true,
    ]
  )

  return rows[0]
})
