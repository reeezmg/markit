import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { billId, companyId, status, paymentMethod } = await readBody(event)

  if (!billId || !companyId || !status) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId, companyId and status are required',
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      UPDATE bills
      SET
        payment_status = $3::"PaymentStatus",
        payment_method = $4,
        updated_at = now(),
        created_at = CASE
          WHEN $3::"PaymentStatus" = 'PAID'::"PaymentStatus"
            THEN now()
          ELSE created_at
        END
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      RETURNING invoice_number, payment_status
      `,
      [
        billId,
        companyId,
        status, // string like 'PAID'
        status === 'PAID' ? paymentMethod : 'Credit',
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
      paymentStatus: res.rows[0].payment_status,
    }
  } finally {
    client.release()
  }
})
