import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { assertNoBillReceipts } from '~/server/utils/bill-receipts'
import { billCreditCents } from '~/utils/bill-credit'

export default defineEventHandler(async (event) => {
  const { billId, companyId, paymentMethod, splitPayments } = await readBody(event)
  const session = await useCompanyRequestSession(event)
  if (companyId !== session.data.companyId) throw createError({statusCode:403,statusMessage:'Company access denied'})

  if (!billId || !companyId || !paymentMethod) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId, companyId and paymentMethod are required',
    })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const old = (await client.query('SELECT * FROM bills WHERE id=$1 AND company_id=$2 AND deleted=false FOR UPDATE', [billId,companyId])).rows[0]
    if (!old) throw createError({statusCode:404,statusMessage:'Bill not found'})
    await assertNoBillReceipts(client,companyId,billId)
    if (billCreditCents(old) > 0) throw createError({statusCode:409,statusMessage:'Record a dated receipt for credit; edit the unpaid invoice to correct its original split'})
    if (!['Cash','UPI','Card','Bank','Cheque','Credit','Split'].includes(paymentMethod)) throw createError({statusCode:400,statusMessage:'Invalid payment method'})
    const credit = billCreditCents({grandTotal:old.grand_total,paymentMethod,splitPayments})
    const res = await client.query(
      `
      UPDATE bills
      SET
        payment_method = $3,
        split_payments = $4::jsonb,
        payment_status = $5::"PaymentStatus",
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
        credit > 0 ? 'PENDING' : 'PAID',
      ]
    )

    if (!res.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }

    await client.query('COMMIT')
    return {
      success: true,
      invoiceNumber: res.rows[0].invoice_number,
      paymentMethod: res.rows[0].payment_method,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
