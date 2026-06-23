import { pool } from '~/server/db'
import { ensureEcommFaqsTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'FAQ id is required' })
  }

  await ensureEcommFaqsTable()

  const { rowCount } = await pool.query(
    `DELETE FROM ecomm_faqs WHERE id = $1 AND company_id = $2`,
    [id, session.data.companyId]
  )

  if (!rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'FAQ not found' })
  }

  return { success: true }
})
