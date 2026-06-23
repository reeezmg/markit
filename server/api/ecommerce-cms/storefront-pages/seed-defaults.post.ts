import { pool } from '~/server/db'
import { ensureStorefrontPagesTable } from '~/server/utils/storefrontPages'

import homeConfig      from '~/lib/ecom-engine-default-pages/home.json'
import aboutConfig     from '~/lib/ecom-engine-default-pages/about.json'
import contactConfig   from '~/lib/ecom-engine-default-pages/contact.json'
import blogConfig      from '~/lib/ecom-engine-default-pages/blog.json'
import howToUseConfig  from '~/lib/ecom-engine-default-pages/how-to-use.json'
import trackConfig     from '~/lib/ecom-engine-default-pages/track.json'

const DEFAULTS: Record<string, object> = {
  home:         homeConfig,
  about:        aboutConfig,
  contact:      contactConfig,
  blog:         blogConfig,
  'how-to-use': howToUseConfig,
  track:        trackConfig,
}

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)

  // Allow body to override company ID (admin use); falls back to session company
  const body = await readBody<{ companyId?: string }>(event).catch(() => ({}))
  const companyId = body?.companyId || session.data.companyId

  await ensureStorefrontPagesTable()

  const upserted: string[] = []

  for (const [slug, config] of Object.entries(DEFAULTS)) {
    await pool.query(
      `INSERT INTO storefront_pages (id, created_at, updated_at, company_id, slug, config, published)
       VALUES (gen_random_uuid()::text, NOW(), NOW(), $1, $2, $3, true)
       ON CONFLICT (company_id, slug) DO NOTHING`,
      [companyId, slug, JSON.stringify(config)]
    )
    upserted.push(slug)
  }

  return { companyId, upserted }
})
