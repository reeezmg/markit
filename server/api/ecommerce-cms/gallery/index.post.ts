import { pool } from '~/server/db'
import { ensureEcommGalleryTable } from '~/server/utils/ecommGallery'

// Gallery is strictly YouTube-only (videos / Shorts).
const YT_RE = /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{
    name?: string
    url?: string
    sortOrder?: number
    status?: boolean
  }>(event)

  const name = body.name?.trim()
  const url = body.url?.trim() || null

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (!url || !YT_RE.test(url)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid YouTube link (video or Short) is required' })
  }

  await ensureEcommGalleryTable()

  const { rows } = await pool.query(
    `
      INSERT INTO ecomm_gallery (company_id, name, type, media_key, url, sort_order, status)
      VALUES ($1, $2, 'YOUTUBE', NULL, $3, COALESCE($4, 0), COALESCE($5, TRUE))
      RETURNING id, name, type, media_key AS "mediaKey", url,
                sort_order AS "sortOrder", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [session.data.companyId, name, url, body.sortOrder ?? 0, body.status ?? true]
  )

  return rows[0]
})
