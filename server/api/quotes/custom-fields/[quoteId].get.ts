import { pool } from '~/server/db'

const ensureQuoteCustomFieldValuesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_custom_field_values (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      field_values JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS quote_custom_field_values_company_idx
    ON quote_custom_field_values (company_id)
  `)
}

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const quoteId = getRouterParam(event, 'quoteId')

  if (!quoteId) {
    throw createError({ statusCode: 400, statusMessage: 'Quote id is required' })
  }

  await ensureQuoteCustomFieldValuesTable()

  const result = await pool.query(
    `
      SELECT field_values AS "values"
      FROM quote_custom_field_values
      WHERE quote_id = $1
        AND company_id = $2
      LIMIT 1
    `,
    [quoteId, session.data.companyId]
  )

  return result.rows[0]?.values || {}
})
