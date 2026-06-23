import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { investmentLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const amount = Number(body.amount || 0)
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'User is required' })
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()
  const status = body.status || 'COMPLETED'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO investments (id, company_id, "userId", direction, amount, payment_mode, status, note, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
      [id, companyId, body.userId, body.direction || 'IN', amount, body.paymentMode || 'CASH', status, body.note || null, createdAt],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'INVESTMENT',
      sourceId: id,
      rows: investmentLedgerRows({ id, companyId, amount, direction: body.direction || 'IN', status, createdAt, note: body.note }),
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
