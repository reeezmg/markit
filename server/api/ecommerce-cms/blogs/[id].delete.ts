import { pool } from '~/server/db'
import { ensureEcommBlogsTable } from '~/server/utils/ecommFaqs'
import { cleanupMediaKeys } from '~/server/utils/mediaCleanup'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  await ensureEcommBlogsTable()

  const result = await pool.query(
    'DELETE FROM ecomm_blogs WHERE id = $1 AND company_id = $2 RETURNING image',
    [id, session.data.companyId]
  )

  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Blog not found' })

  // The cover image is nobody's now — drop it from Cloudflare.
  const removedMedia = await cleanupMediaKeys([result.rows[0]?.image].filter(Boolean))
  return { success: true, removedMedia: removedMedia.length }
})
