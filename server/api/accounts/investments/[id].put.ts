import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { investmentLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Investment id is required' })
  const body = await readBody<any>(event)
  const amount = Number(body.amount || 0)
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'User is required' })
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()
  const status = body.status || 'COMPLETED'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(
      `
      UPDATE investments
      SET "userId" = $3,
          direction = $4,
          amount = $5,
          payment_mode = $6,
          status = $7,
          note = $8,
          created_at = $9,
          updated_at = now()
      WHERE id = $1 AND company_id = $2
      RETURNING id
      `,
      [id, companyId, body.userId, body.direction || 'IN', amount, body.paymentMode || 'CASH', status, body.note || null, createdAt],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Investment not found' })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'INVESTMENT',
      sourceId: id,
      rows: investmentLedgerRows({ id, companyId, amount, direction: body.direction || 'IN', status, createdAt, note: body.note }),
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
