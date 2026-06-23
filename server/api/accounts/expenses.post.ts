import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { expenseLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const totalAmount = Number(body.totalAmount || 0)
  if (!body.expensecategoryId) throw createError({ statusCode: 400, statusMessage: 'Expense category is required' })
  if (!totalAmount || totalAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const expenseDate = body.expenseDate || body.date ? new Date(body.expenseDate || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO expenses
        (id, company_id, from_id, expense_category_id, expense_date, note, payment_mode, status, receipt, receipt_name, tax_amount, total_amount, created_at, updated_at, expense_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now(),$13)
      `,
      [id, companyId, body.userId || null, body.expensecategoryId, expenseDate, body.note || null, body.paymentMode || 'CASH', body.status || 'Pending', body.receipt || null, body.receiptName || null, Number(body.taxAmount || 0), totalAmount, body.expenseNumber || null],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'EXPENSE',
      sourceId: id,
      rows: expenseLedgerRows({ id, companyId, totalAmount, paymentMode: body.paymentMode || 'CASH', status: body.status || 'Pending', expenseDate, note: body.note }),
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
