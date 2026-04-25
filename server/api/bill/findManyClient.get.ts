import { createError, defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  const query = getQuery(event)
  const q = String(query.q || '').trim()

  if (!q) {
    throw createError({
      statusCode: 400,
      statusMessage: 'q is required',
    })
  }

  const digits = q.replace(/\D/g, '')
  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        cc.points
      FROM clients c
      INNER JOIN company_clients cc
        ON cc.client_id = c.id
       AND cc.company_id = $1
      WHERE c.deleted = false
        AND (
          c.name ILIKE '%' || $2 || '%'
          OR ($3 <> '' AND regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '%' || $3 || '%')
        )
      ORDER BY
        CASE
          WHEN LOWER(c.name) = LOWER($2) THEN 0
          WHEN $3 <> '' AND RIGHT(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT($3, 10) THEN 0
          ELSE 1
        END,
        c.name ASC
      LIMIT 5;
      `,
      [companyId, q, digits]
    )

    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      points: Number(row.points || 0),
    }))
  } finally {
    client.release()
  }
})
