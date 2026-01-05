import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { billId, companyId } = await readBody(event)

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
      SET deleted = true,
          updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      RETURNING invoice_number
      `,
      [billId, companyId]
    )

    if (!res.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or already deleted',
      })
    }

    return {
      success: true,
      invoiceNumber: res.rows[0].invoice_number,
    }
  } finally {
    client.release()
  }
})
