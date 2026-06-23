import { pool } from '~/server/db'

// any ID format → "hero-banner-1", "product-grid-2", etc. based on section type
function migrateConfig(config: any): any {
  if (!config?.sections || !config?.order) return config

  const idMap: Record<string, string> = {}
  const typeCount: Record<string, number> = {}

  for (const oldId of (config.order as string[])) {
    const section = config.sections[oldId]
    if (!section) continue
    const type: string = section.type ?? oldId
    typeCount[type] = (typeCount[type] ?? 0) + 1
    idMap[oldId] = `${type}-${typeCount[type]}`
  }

  const newSections: Record<string, any> = {}
  for (const [oldId, section] of Object.entries(config.sections)) {
    newSections[idMap[oldId] ?? oldId] = section
  }

  const newOrder = (config.order as string[]).map(id => idMap[id] ?? id)

  return { ...config, sections: newSections, order: newOrder }
}

export default defineEventHandler(async (event) => {
  await requireAuthSession(event)

  const { rows } = await pool.query(
    `SELECT id, slug, company_id, config FROM storefront_pages`
  )

  let updated = 0
  for (const row of rows) {
    const newConfig = migrateConfig(row.config)
    await pool.query(
      `UPDATE storefront_pages SET config = $1 WHERE id = $2`,
      [JSON.stringify(newConfig), row.id]
    )
    updated++
  }

  return { migrated: updated }
})
