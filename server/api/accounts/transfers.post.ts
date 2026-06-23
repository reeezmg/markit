import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { rebuildAccountLedgerForSource, transferLedgerRows } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const amount = Number(body.amount || 0)
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO account_transfers (id, company_id, from_type, from_account_id, to_type, to_account_id, amount, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, companyId, body.fromType, body.fromAccountId || null, body.toType, body.toAccountId || null, amount, body.note || null, createdAt],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'ACCOUNT_TRANSFER',
      sourceId: id,
      rows: transferLedgerRows({ id, companyId, fromType: body.fromType, fromAccountId: body.fromAccountId, toType: body.toType, toAccountId: body.toAccountId, amount, createdAt, note: body.note }),
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
