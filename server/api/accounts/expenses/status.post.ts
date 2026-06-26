import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { expenseLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ ids?: string[]; status?: string }>(event)
  const ids = (Array.isArray(body.ids) ? body.ids : []).map((v) => String(v)).filter(Boolean)
  const status = String(body.status || '').trim()
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No expenses selected' })
  if (!status) throw createError({ statusCode: 400, statusMessage: 'Status is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query(
      `
      UPDATE expenses
      SET status = $1, updated_at = now()
      WHERE company_id = $2 AND id = ANY($3)
      RETURNING id, total_amount AS "totalAmount", payment_mode AS "paymentMode", status, expense_date AS "expenseDate", note
      `,
      [status, companyId, ids],
    )

    // Status drives whether an expense contributes to the account ledger
    // (only PAID expenses do), so rebuild the ledger for each touched row.
    for (const row of updated.rows) {
      await rebuildAccountLedgerForSource(client, {
        companyId,
        sourceType: 'EXPENSE',
        sourceId: row.id,
        rows: expenseLedgerRows({
          id: row.id,
          companyId,
          totalAmount: row.totalAmount,
          paymentMode: row.paymentMode,
          status: row.status,
          expenseDate: row.expenseDate,
          note: row.note,
        }),
      })
    }

    await client.query('COMMIT')
    return { success: true, count: updated.rowCount }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
