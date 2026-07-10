import { pool } from '~/server/db'
import { ensureEcommGalleryTable } from '~/server/utils/ecommGallery'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await ensureEcommGalleryTable()

  const { rows } = await pool.query(
    `
      SELECT id, name, type, media_key AS "mediaKey", url,
             sort_order AS "sortOrder", status,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM ecomm_gallery
      WHERE company_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `,
    [session.data.companyId]
  )

  return rows
})
