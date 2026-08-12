import { pool } from '~/server/db'
import {
  GALLERY_TYPES,
  ensureEcommGalleryTable,
  validateGalleryMedia,
  type GalleryType,
} from '~/server/utils/ecommGallery'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{
    name?: string
    type?: string
    mediaKey?: string | null
    url?: string | null
    sortOrder?: number
    status?: boolean
  }>(event)

  const name = body.name?.trim()
  const type = String(body.type || '').toUpperCase() as GalleryType

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (!GALLERY_TYPES.includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Type must be PHOTO or VIDEO' })
  }

  const media = validateGalleryMedia({
    type,
    mediaKey: body.mediaKey ?? null,
    url: body.url ?? null,
  })

  await ensureEcommGalleryTable()

  const { rows } = await pool.query(
    `
      INSERT INTO ecomm_gallery (company_id, name, type, media_key, url, sort_order, status)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, TRUE))
      RETURNING id, name, type, media_key AS "mediaKey", url,
                sort_order AS "sortOrder", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [
      session.data.companyId,
      name,
      media.type,
      media.mediaKey,
      media.url,
      body.sortOrder ?? 0,
      body.status ?? true,
    ]
  )

  return {
    ...rows[0],
    mediaUrl: rows[0].mediaKey ? `https://images.markit.co.in/${rows[0].mediaKey}` : null,
  }
})
