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
  const body = await readBody<{
    pageName?: string
    key?: string
    value?: unknown
    active?: boolean
  }>(event)

  if (!body.pageName || !body.key || body.value === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'pageName, key, and value are required' })
  }

  await ensureGeneralPreferencesTable()

  const result = await pool.query(
    `
      INSERT INTO general_preferences (company_id, page_name, preference_key, preference_value, active)
      VALUES ($1, $2, $3, $4::jsonb, COALESCE($5, TRUE))
      ON CONFLICT (company_id, page_name, preference_key)
      DO UPDATE SET
        preference_value = EXCLUDED.preference_value,
        active = EXCLUDED.active,
        updated_at = NOW()
      RETURNING id, page_name AS "pageName", preference_key AS "key", preference_value AS "value", active
    `,
    [
      session.data.companyId,
      body.pageName,
      body.key,
      JSON.stringify(body.value),
      body.active ?? true,
    ]
  )

  return result.rows[0]
})
