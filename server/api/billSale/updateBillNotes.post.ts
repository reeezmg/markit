import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { billId, companyId, notes } = await readBody(event)

  if (!billId || !companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId and companyId are required',
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      UPDATE bills
      SET notes = $3,
          updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      RETURNING id
      `,
      [billId, companyId, notes ?? null]
    )

    if (!res.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }

    return {
      success: true,
      billId: res.rows[0].id,
    }
  } finally {
    client.release()
  }
})
