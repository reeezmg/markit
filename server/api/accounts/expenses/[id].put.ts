import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { expenseLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Expense id is required' })
  const body = await readBody<any>(event)
  const totalAmount = Number(body.totalAmount || 0)
  if (!body.expensecategoryId) throw createError({ statusCode: 400, statusMessage: 'Expense category is required' })
  if (!totalAmount || totalAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const expenseDate = body.expenseDate || body.date ? new Date(body.expenseDate || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(
      `
      UPDATE expenses
      SET from_id = $3,
          expense_category_id = $4,
          expense_date = $5,
          note = $6,
          payment_mode = $7,
          status = $8,
          receipt = $9,
          receipt_name = $10,
          tax_amount = $11,
          total_amount = $12,
          expense_number = COALESCE($13, expense_number),
          updated_at = now()
      WHERE id = $1 AND company_id = $2
      RETURNING id
      `,
      [id, companyId, body.userId || null, body.expensecategoryId, expenseDate, body.note || null, body.paymentMode || 'CASH', body.status || 'Pending', body.receipt || null, body.receiptName || null, Number(body.taxAmount || 0), totalAmount, body.expenseNumber || null],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Expense not found' })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'EXPENSE',
      sourceId: id,
      rows: expenseLedgerRows({ id, companyId, totalAmount, paymentMode: body.paymentMode || 'CASH', status: body.status || 'Pending', expenseDate, note: body.note }),
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
