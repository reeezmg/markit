import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { distributorPaymentLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const amount = Number(body.amount || 0)
  if (!body.distributorId) throw createError({ statusCode: 400, statusMessage: 'Distributor is required' })
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO distributor_payments
        (id, created_at, payment_no, amount, remarks, bill_no, payment_type, distributor_id, company_id, purchase_order_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [id, createdAt, body.paymentNo || null, amount, body.remarks || null, body.billNo || null, body.paymentType || 'CASH', body.distributorId, companyId, body.purchaseOrderId || null],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'DISTRIBUTOR_PAYMENT',
      sourceId: id,
      rows: distributorPaymentLedgerRows({ id, companyId, amount, paymentType: body.paymentType || 'CASH', createdAt, remarks: body.remarks }),
    })
    await client.query('COMMIT')
    return { success: true, id }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
