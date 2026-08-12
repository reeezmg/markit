import { pool } from '~/server/db'
import {
  GALLERY_TYPES,
  ensureEcommGalleryTable,
  normalizeGalleryType,
  validateGalleryMedia,
  type GalleryType,
} from '~/server/utils/ecommGallery'
import { cleanupMediaKeys } from '~/server/utils/mediaCleanup'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    name?: string
    type?: string
    mediaKey?: string | null
    url?: string | null
    sortOrder?: number
    status?: boolean
  }>(event) || {}

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Gallery id is required' })
  }

  await ensureEcommGalleryTable()

  // Partial updates (the list view sends `{ status }` alone), so merge against the
  // stored row before validating — otherwise a status toggle would look like a row
  // with neither an upload nor a link.
  const { rows: existingRows } = await pool.query(
    `SELECT type, media_key AS "mediaKey", url FROM ecomm_gallery WHERE id = $1 AND company_id = $2`,
    [id, session.data.companyId]
  )
  const existing = existingRows[0]
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery item not found' })
  }

  const has = (field: string) => Object.prototype.hasOwnProperty.call(body, field)

  let type: GalleryType = normalizeGalleryType(existing.type)
  if (has('type')) {
    const requested = String(body.type || '').toUpperCase() as GalleryType
    if (!GALLERY_TYPES.includes(requested)) {
      throw createError({ statusCode: 400, statusMessage: 'Type must be PHOTO or VIDEO' })
    }
    type = requested
  }

  const media = validateGalleryMedia({
    type,
    mediaKey: has('mediaKey') ? (body.mediaKey ?? null) : existing.mediaKey,
    url: has('url') ? (body.url ?? null) : existing.url,
  })

  const name = has('name') ? body.name?.trim() : undefined
  if (has('name') && !name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const { rows } = await pool.query(
    `
      UPDATE ecomm_gallery
      SET name = COALESCE($3, name),
          type = $4,
          media_key = $5,
          url = $6,
          sort_order = COALESCE($7, sort_order),
          status = COALESCE($8, status),
          updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING id, name, type, media_key AS "mediaKey", url,
                sort_order AS "sortOrder", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [
      id,
      session.data.companyId,
      name ?? null,
      media.type,
      media.mediaKey,
      media.url,
      body.sortOrder ?? null,
      body.status ?? null,
    ]
  )

  if (!rows[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery item not found' })
  }

  // Swapping the uploaded file (or clearing it for a link-only row) leaves the
  // previous object unreferenced.
  if (existing.mediaKey && existing.mediaKey !== media.mediaKey) {
    await cleanupMediaKeys([existing.mediaKey])
  }

  return {
    ...rows[0],
    mediaUrl: rows[0].mediaKey ? `https://images.markit.co.in/${rows[0].mediaKey}` : null,
  }
})
