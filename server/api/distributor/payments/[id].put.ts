import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { distributorPaymentLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Payment id is required' })
  const body = await readBody<any>(event)
  const amount = Number(body.amount || 0)
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(
      `
      UPDATE distributor_payments
      SET amount = $3,
          remarks = $4,
          bill_no = $5,
          payment_type = $6,
          purchase_order_id = $7,
          created_at = $8
      WHERE id = $1 AND company_id = $2
      RETURNING id
      `,
      [id, companyId, amount, body.remarks || null, body.billNo || null, body.paymentType || 'CASH', body.purchaseOrderId || null, createdAt],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'DISTRIBUTOR_PAYMENT',
      sourceId: id,
      rows: distributorPaymentLedgerRows({ id, companyId, amount, paymentType: body.paymentType || 'CASH', createdAt, remarks: body.remarks }),
    })
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
