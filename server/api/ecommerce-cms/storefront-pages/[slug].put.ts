import { pool } from '~/server/db'
import { ensureStorefrontPagesTable } from '~/server/utils/storefrontPages'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const slug = getRouterParam(event, 'slug')
  const body = await readBody<{ config: object; published?: boolean }>(event)

  if (!body?.config || typeof body.config !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'config is required and must be an object' })
  }

  await ensureStorefrontPagesTable()

  const { rows } = await pool.query(
    `INSERT INTO storefront_pages (company_id, slug, config, published)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, slug)
     DO UPDATE SET config = EXCLUDED.config, published = EXCLUDED.published, updated_at = NOW()
     RETURNING slug, published, updated_at AS "updatedAt"`,
    [session.data.companyId, slug, JSON.stringify(body.config), body.published ?? false]
  )

  return rows[0]
})
