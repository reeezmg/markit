import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { billId, companyId, paymentMethod, splitPayments } = await readBody(event)

  if (!billId || !companyId || !paymentMethod) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId, companyId and paymentMethod are required',
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      UPDATE bills
      SET
        payment_method = $3,
        split_payments = $4::jsonb,
        updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      RETURNING invoice_number, payment_method
      `,
      [
        billId,
        companyId,
        paymentMethod,
        paymentMethod === 'Split' ? JSON.stringify(splitPayments || []) : null,
      ]
    )

    if (!res.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }

    return {
      success: true,
      invoiceNumber: res.rows[0].invoice_number,
      paymentMethod: res.rows[0].payment_method,
    }
  } finally {
    client.release()
  }
})
