import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  /* -------------------------------
     READ QUERY
  -------------------------------- */
  const query = getQuery(event)
  const companyId = query.companyId as string | undefined
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
        hsn
      FROM categories
      WHERE company_id = $1
        AND COALESCE(status, true) = true
      ORDER BY name ASC;
      `,
      [companyId]
    )

    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      hsn: r.hsn,
    }))
  } finally {
    client.release()
  }
})
