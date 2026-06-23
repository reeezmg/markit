import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { rebuildAccountLedgerForSource, transferLedgerRows } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Transfer id is required' })
  const body = await readBody<any>(event)
  const amount = Number(body.amount || 0)
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(
      `
      UPDATE account_transfers
      SET from_type = $3,
          from_account_id = $4,
          to_type = $5,
          to_account_id = $6,
          amount = $7,
          note = $8,
          created_at = $9
      WHERE id = $1 AND company_id = $2
      RETURNING id
      `,
      [id, companyId, body.fromType, body.fromAccountId || null, body.toType, body.toAccountId || null, amount, body.note || null, createdAt],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'ACCOUNT_TRANSFER',
      sourceId: id,
      rows: transferLedgerRows({ id, companyId, fromType: body.fromType, fromAccountId: body.fromAccountId, toType: body.toType, toAccountId: body.toAccountId, amount, createdAt, note: body.note }),
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
