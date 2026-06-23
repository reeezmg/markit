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

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }

  await ensureEcommBlogsTable()
  const slug = slugify(body.slug || body.title)
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug is required' })

  const { rows } = await pool.query(
    `
      INSERT INTO ecomm_blogs
        (company_id, title, slug, excerpt, content, image, tag, read_minutes, sort_order, status)
      VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), COALESCE($8, 4), COALESCE($9, 0), COALESCE($10, TRUE))
      RETURNING id, title, slug, excerpt, content, image, tag,
                read_minutes AS "readMinutes",
                sort_order AS "sortOrder",
                status,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [
      session.data.companyId,
      body.title.trim(),
      slug,
      body.excerpt?.trim() || '',
      body.content || '',
      body.image?.trim() || '',
      body.tag?.trim() || '',
      body.readMinutes ?? 4,
      body.sortOrder ?? 0,
      body.status ?? true,
    ]
  )

  return rows[0]
})
