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
  const body = await readBody<{ values?: Record<string, any> }>(event)

  if (!quoteId) {
    throw createError({ statusCode: 400, statusMessage: 'Quote id is required' })
  }

  await ensureQuoteCustomFieldValuesTable()

  const quoteCheck = await pool.query(
    `SELECT id FROM quotes WHERE id = $1 AND company_id = $2 AND deleted = FALSE LIMIT 1`,
    [quoteId, session.data.companyId]
  )

  if (!quoteCheck.rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  }

  const result = await pool.query(
    `
      INSERT INTO quote_custom_field_values (quote_id, company_id, field_values)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (quote_id)
      DO UPDATE SET
        field_values = EXCLUDED.field_values,
        updated_at = NOW()
      RETURNING field_values AS "values"
    `,
    [quoteId, session.data.companyId, JSON.stringify(body.values || {})]
  )

  return result.rows[0]?.values || {}
})
