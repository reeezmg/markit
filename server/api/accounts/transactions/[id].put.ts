import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { moneyTransactionLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Transaction id is required' })

  const body = await readBody<any>(event)
  const amount = Number(body.amount || 0)
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()
  const paymentMode = body.paymentMode || 'CASH'
  const accountId = paymentMode === 'BANK' ? body.accountId || null : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(
      `
      UPDATE money_transactions
      SET party_type = $3,
          direction = $4,
          status = $5,
          amount = $6,
          payment_mode = $7,
          account_id = $8,
          note = $9,
          created_at = $10,
          updated_at = now()
      WHERE id = $1 AND company_id = $2
      RETURNING id
      `,
      [id, companyId, body.partyType || 'OTHER', body.direction || 'GIVEN', body.status || 'PENDING', amount, paymentMode, accountId, body.note || null, createdAt],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Transaction not found' })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'MONEY_TRANSACTION',
      sourceId: id,
      rows: moneyTransactionLedgerRows({ id, companyId, amount, paymentMode, accountId, direction: body.direction || 'GIVEN', status: body.status || 'PENDING', createdAt, note: body.note }),
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
