import { pool } from '~/server/db'
import { ensureEcommFeedbackTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  await ensureEcommFeedbackTable()

  const result = await pool.query(
    'DELETE FROM ecomm_feedback WHERE id = $1 AND company_id = $2',
    [id, session.data.companyId]
  )

  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Feedback not found' })
  return { success: true }
})
