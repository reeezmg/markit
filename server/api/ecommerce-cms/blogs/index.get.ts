import { pool } from '~/server/db'
import { ensureEcommBlogsTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await ensureEcommBlogsTable()

  const { rows } = await pool.query(
    `
      SELECT id, title, slug, excerpt, content, image, tag,
             read_minutes AS "readMinutes",
             sort_order AS "sortOrder",
             status,
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM ecomm_blogs
      WHERE company_id = $1
      ORDER BY sort_order ASC, created_at DESC
    `,
    [session.data.companyId]
  )

  return rows
})
