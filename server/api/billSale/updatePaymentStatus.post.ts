import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest'
import { settleCreditPayment } from '~/utils/credit-payment'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { assertNoBillReceipts } from '~/server/utils/bill-receipts'
import { billCreditCents } from '~/utils/bill-credit'


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const { billId, companyId = session.data.companyId, status, paymentMethod } = await readBody(event)
  if (companyId !== session.data.companyId) throw createError({statusCode:403,statusMessage:'Company access denied'})
  if (!['PAID','PENDING','APPROVED','REJECTED','COMPLETED','FAILED'].includes(status)) throw createError({statusCode:400,statusMessage:'Invalid payment status'})

  if (!billId || !companyId || !status) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId, companyId and status are required',
    })
  }

  const client = await pool.connect()

  try {

    await client.query('BEGIN')
    await lockCompanyRequest(event, client)

    const existingRes = await client.query(
      `
      SELECT invoice_number, payment_status, payment_method, split_payments, grand_total, created_at,
             is_markit, deleted, client_id, COALESCE(bill_points, 0) AS bill_points
      FROM bills
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      FOR UPDATE
      `,
      [billId, companyId],
    )

    if (!existingRes.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }

    const existingBill = existingRes.rows[0]
    if (status === existingBill.payment_status) {
      await client.query('COMMIT')
      return { success: true, invoiceNumber: existingBill.invoice_number, paymentStatus: status }
    }
    await assertNoBillReceipts(client, companyId, billId)
    if (status === 'PAID' && billCreditCents(existingBill) > 0) {
      throw createError({statusCode:409,statusMessage:'Record a dated credit receipt to pay this bill'})
    }
    let payment
    try { payment = settleCreditPayment(existingBill, status, paymentMethod) }
    catch (e: any) { throw createError({statusCode:400,statusMessage:e.message}) }
    const res = await client.query(
      `
      UPDATE bills
      SET
        payment_status = $3::"PaymentStatus",
        payment_method = $4,
        split_payments = $5::jsonb,
        updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND deleted = false
      RETURNING invoice_number, payment_status, payment_method, split_payments, grand_total, created_at, is_markit, deleted
      `,
      [
        billId,
        companyId,
        status, // string like 'PAID'
        payment.method,
        JSON.stringify(payment.splits),
      ]
    )

    if (!res.rowCount) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found or deleted',
      })
    }
    const bill = res.rows[0]

    // Ecommerce points are granted when the order is created. Starting a
    // refund removes that award once; bill_points = 0 is the idempotency guard.
    if (status === 'REFUNDED' && existingBill.client_id && Number(existingBill.bill_points || 0) > 0) {
      const ecommerceOrder = await client.query(
        `SELECT id FROM ecomm_orders WHERE bill_id = $1 AND company_id = $2 LIMIT 1`,
        [billId, companyId],
      )
      if (ecommerceOrder.rows.length) {
        await client.query(
          `UPDATE company_clients
           SET points = GREATEST(0, COALESCE(points, 0) - $1)
           WHERE company_id = $2 AND client_id = $3`,
          [Number(existingBill.bill_points), companyId, existingBill.client_id],
        )
        await client.query(
          `UPDATE bills SET bill_points = 0, updated_at = now()
           WHERE id = $1 AND company_id = $2`,
          [billId, companyId],
        )
      }
    }
    await client.query('COMMIT')

    return {
      success: true,
      invoiceNumber: bill.invoice_number,
      paymentStatus: bill.payment_status,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
