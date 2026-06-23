import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { moneyTransactionLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ ids?: string[]; status?: string }>(event)
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No transactions selected' })
  const status = body.status === 'PAID' ? 'PAID' : 'PENDING'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rows = await client.query(
      `
      UPDATE money_transactions
      SET status = $3, updated_at = now()
      WHERE company_id = $1 AND id = ANY($2::text[])
      RETURNING id, company_id, amount, payment_mode, account_id, direction, status, created_at, note
      `,
      [companyId, ids, status],
    )
    for (const row of rows.rows) {
      await rebuildAccountLedgerForSource(client, {
        companyId,
        sourceType: 'MONEY_TRANSACTION',
        sourceId: row.id,
        rows: moneyTransactionLedgerRows({
          id: row.id,
          companyId: row.company_id,
          amount: row.amount,
          paymentMode: row.payment_mode,
          accountId: row.account_id,
          direction: row.direction,
          status: row.status,
          createdAt: row.created_at,
          note: row.note,
        }),
      })
    }
    await client.query('COMMIT')
    return { success: true, count: rows.rowCount }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
