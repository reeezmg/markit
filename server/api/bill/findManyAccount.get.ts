import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
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
        phone
      FROM accounts
      WHERE company_id = $1
      `,
      [companyId]
    )

    return res.rows
  } finally {
    client.release()
  }
})
