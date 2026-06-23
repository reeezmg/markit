import { pool } from '~/server/db'
import { ensureEcommFaqsTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    question?: string
    answer?: string
    sortOrder?: number
    status?: boolean
  }>(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'FAQ id is required' })
  }

  await ensureEcommFaqsTable()

  const { rows } = await pool.query(
    `
      UPDATE ecomm_faqs
      SET question = COALESCE($3, question),
          answer = COALESCE($4, answer),
          sort_order = COALESCE($5, sort_order),
          status = COALESCE($6, status),
          updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING id, question, answer, sort_order AS "sortOrder", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [
      id,
      session.data.companyId,
      body.question?.trim() || null,
      body.answer?.trim() || null,
      body.sortOrder ?? null,
      body.status ?? null,
    ]
  )

  if (!rows[0]) {
    throw createError({ statusCode: 404, statusMessage: 'FAQ not found' })
  }

  return rows[0]
})
