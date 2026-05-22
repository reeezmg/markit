import { pool } from '~/server/db'

const ensureGeneralPreferencesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS general_preferences (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      page_name TEXT NOT NULL,
      preference_key TEXT NOT NULL,
      preference_value JSONB NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      CONSTRAINT general_preferences_company_page_key_unique UNIQUE (company_id, page_name, preference_key)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS general_preferences_company_page_idx
    ON general_preferences (company_id, page_name)
  `)
}

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const query = getQuery(event)
  const pageName = typeof query.pageName === 'string' ? query.pageName : ''
  const key = typeof query.key === 'string' ? query.key : ''

  if (!pageName) {
    throw createError({ statusCode: 400, statusMessage: 'pageName is required' })
  }

  await ensureGeneralPreferencesTable()

  const params: any[] = [session.data.companyId, pageName]
  let sql = `
    SELECT id, page_name AS "pageName", preference_key AS "key", preference_value AS "value", active
    FROM general_preferences
    WHERE company_id = $1
      AND page_name = $2
      AND active = TRUE
  `

  if (key) {
    params.push(key)
    sql += ` AND preference_key = $3`
  }

  sql += ` ORDER BY preference_key ASC`

  const result = await pool.query(sql, params)

  if (key) {
    return result.rows[0] || null
  }

  return result.rows
})
