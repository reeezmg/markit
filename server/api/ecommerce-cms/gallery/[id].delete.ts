import { pool } from '~/server/db'
import { ensureEcommGalleryTable } from '~/server/utils/ecommGallery'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Gallery id is required' })
  }

  await ensureEcommGalleryTable()

  const { rowCount } = await pool.query(
    `DELETE FROM ecomm_gallery WHERE id = $1 AND company_id = $2`,
    [id, session.data.companyId]
  )

  if (!rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery item not found' })
  }

  return { success: true }
})
