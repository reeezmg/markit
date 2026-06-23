import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { moneyTransactionLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const amount = Number(body.amount || 0)
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()
  const paymentMode = body.paymentMode || 'CASH'
  const accountId = paymentMode === 'BANK' ? body.accountId || null : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO money_transactions
        (id, company_id, party_type, direction, status, amount, payment_mode, account_id, note, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      `,
      [id, companyId, body.partyType || 'OTHER', body.direction || 'GIVEN', body.status || 'PENDING', amount, paymentMode, accountId, body.note || null, createdAt],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'MONEY_TRANSACTION',
      sourceId: id,
      rows: moneyTransactionLedgerRows({ id, companyId, amount, paymentMode, accountId, direction: body.direction || 'GIVEN', status: body.status || 'PENDING', createdAt, note: body.note }),
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
