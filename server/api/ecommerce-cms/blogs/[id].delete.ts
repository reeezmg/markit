import { pool } from '~/server/db'
import { ensureEcommBlogsTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  await ensureEcommBlogsTable()

  const result = await pool.query(
    'DELETE FROM ecomm_blogs WHERE id = $1 AND company_id = $2',
    [id, session.data.companyId]
  )

  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Blog not found' })
  return { success: true }
})
