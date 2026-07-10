import { pool } from '~/server/db'
import { ensureEcommGalleryTable } from '~/server/utils/ecommGallery'

// Gallery is strictly YouTube-only (videos / Shorts).
const YT_RE = /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    name?: string
    url?: string
    sortOrder?: number
    status?: boolean
  }>(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Gallery id is required' })
  }

  const url = body.url?.trim()
  // url is optional on PUT (e.g. status-only toggle), but if present it must be YouTube.
  if (url !== undefined && url !== '' && !YT_RE.test(url)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid YouTube link (video or Short) is required' })
  }

  await ensureEcommGalleryTable()

  const { rows } = await pool.query(
    `
      UPDATE ecomm_gallery
      SET name = COALESCE($3, name),
          type = 'YOUTUBE',
          media_key = NULL,
          url = COALESCE($4, url),
          sort_order = COALESCE($5, sort_order),
          status = COALESCE($6, status),
          updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING id, name, type, media_key AS "mediaKey", url,
                sort_order AS "sortOrder", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [
      id,
      session.data.companyId,
      body.name?.trim() || null,
      url || null,
      body.sortOrder ?? null,
      body.status ?? null,
    ]
  )

  if (!rows[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery item not found' })
  }

  return rows[0]
})
