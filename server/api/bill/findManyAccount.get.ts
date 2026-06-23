import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const companyId = query.companyId as string | undefined
  const includeUsers = String(query.includeUsers || '').toLowerCase() === 'true'

  if (!companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'companyId is required',
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        id,
        name,
        phone
      FROM accounts
      WHERE company_id = $1
      `,
      [companyId]
    )

    if (includeUsers) {
      const userRes = await client.query(
        `
        SELECT
          user_id AS id,
          name,
          code
        FROM company_users
        WHERE company_id = $1
          AND deleted = false
          AND status = true
        ORDER BY name NULLS LAST, code NULLS LAST
        `,
        [companyId]
      )

      return [
        { id: '__accounts__', name: 'Account', kind: 'header', disabled: true },
        ...res.rows.map((row) => ({
          ...row,
          id: `account:${row.id}`,
          rawId: row.id,
          kind: 'account',
        })),
        { id: '__users__', name: 'User', kind: 'header', disabled: true },
        ...userRes.rows.map((row) => {
          const code = row.code == null ? '' : String(row.code)
          return {
            id: `user:${row.id}`,
            rawId: row.id,
            kind: 'user',
            code,
            name: code ? `${row.name || row.id} (${code})` : (row.name || row.id),
          }
        }),
      ]
    }

    return res.rows
  } finally {
    client.release()
  }
})
