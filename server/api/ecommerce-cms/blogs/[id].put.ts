import { pool } from '~/server/db'
import { ensureEcommBlogsTable } from '~/server/utils/ecommFaqs'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    title?: string
    slug?: string
    excerpt?: string
    content?: string
    image?: string
    tag?: string
    readMinutes?: number
    sortOrder?: number
    status?: boolean
  }>(event)

  await ensureEcommBlogsTable()
  const slug = body.slug == null ? null : slugify(body.slug)

  const { rows } = await pool.query(
    `
      UPDATE ecomm_blogs
      SET title = COALESCE(NULLIF($3, ''), title),
          slug = COALESCE(NULLIF($4, ''), slug),
          excerpt = COALESCE($5, excerpt),
          content = COALESCE($6, content),
          image = NULLIF(COALESCE($7, image), ''),
          tag = NULLIF(COALESCE($8, tag), ''),
          read_minutes = COALESCE($9, read_minutes),
          sort_order = COALESCE($10, sort_order),
          status = COALESCE($11, status),
          updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING id, title, slug, excerpt, content, image, tag,
                read_minutes AS "readMinutes",
                sort_order AS "sortOrder",
                status,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [
      id,
      session.data.companyId,
      body.title?.trim() || '',
      slug,
      body.excerpt,
      body.content,
      body.image,
      body.tag,
      body.readMinutes,
      body.sortOrder,
      body.status,
    ]
  )

  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Blog not found' })
  return rows[0]
})
