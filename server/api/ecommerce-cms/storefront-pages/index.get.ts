import { pool } from '~/server/db'
import { ensureStorefrontPagesTable } from '~/server/utils/storefrontPages'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await ensureStorefrontPagesTable()

  const { rows } = await pool.query(
    `SELECT slug, published, updated_at AS "updatedAt"
     FROM storefront_pages
     WHERE company_id = $1
     ORDER BY slug`,
    [session.data.companyId]
  )

  return rows
})
