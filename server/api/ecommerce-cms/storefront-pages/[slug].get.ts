import { pool } from '~/server/db'
import { ensureStorefrontPagesTable } from '~/server/utils/storefrontPages'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const slug = getRouterParam(event, 'slug')
  await ensureStorefrontPagesTable()

  const { rows } = await pool.query(
    `SELECT slug, config, published, updated_at AS "updatedAt"
     FROM storefront_pages
     WHERE company_id = $1 AND slug = $2`,
    [session.data.companyId, slug]
  )

  return rows[0] ?? null
})
