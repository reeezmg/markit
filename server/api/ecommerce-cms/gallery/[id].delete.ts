import { pool } from '~/server/db'
import { ensureEcommGalleryTable } from '~/server/utils/ecommGallery'
import { cleanupMediaKeys } from '~/server/utils/mediaCleanup'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Gallery id is required' })
  }

  await ensureEcommGalleryTable()

  // RETURNING gives us the uploaded object's key after the row is gone.
  const { rows, rowCount } = await pool.query(
    `DELETE FROM ecomm_gallery WHERE id = $1 AND company_id = $2 RETURNING media_key AS "mediaKey"`,
    [id, session.data.companyId]
  )

  if (!rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery item not found' })
  }

  const removedMedia = await cleanupMediaKeys([rows[0]?.mediaKey].filter(Boolean))

  return { success: true, removedMedia: removedMedia.length }
})
