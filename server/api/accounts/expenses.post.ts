import { expenseTaxAmounts } from '~/utils/expense-tax';
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<any>(event)
  const totalAmount = Number(body.totalAmount || 0)
  let taxAmounts;
  try { taxAmounts=expenseTaxAmounts(totalAmount,body.taxAmount,body.recoverableTaxAmount); }
  catch(e:any) { throw createError({statusCode:400,statusMessage:e.message}); }
  if (!body.expensecategoryId) throw createError({ statusCode: 400, statusMessage: 'Expense category is required' })
  if (!totalAmount || totalAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })

  const id = crypto.randomUUID()
  const paymentMode = body.paymentMode || 'CASH'
  const status = body.status || 'Pending'
  const expenseDate = body.expenseDate || body.date ? new Date(body.expenseDate || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await lockCompanyRequest(event, client)
    // Number reservation and source insert share this transaction. Deferred
    // Accountant triggers own financial posting; no legacy ledger is written.
    const res = await client.query(
      `WITH numbered AS (
        UPDATE companies SET expense_counter = expense_counter + 1
        WHERE id = $2 RETURNING expense_counter - 1 AS expense_number
      )
      INSERT INTO expenses (
        id, company_id, from_id, expense_category_id, expense_date, note,
        payment_mode, status, receipt, receipt_name, tax_amount, total_amount,
        recoverable_tax_amount, created_at, updated_at, expense_number
      )
      SELECT $1,$2,$3,$4,$5,$6,$7::"PaymentMode",$8,$9,$10,$11,$12,$13,now(),now(),expense_number
      FROM numbered RETURNING expense_number`,
      [id, companyId, body.userId || null, body.expensecategoryId, expenseDate, body.note || null, paymentMode, status, body.receipt || null, body.receiptName || null, taxAmounts.taxAmount, totalAmount, taxAmounts.recoverableTaxAmount],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Company not found' })
    await client.query('COMMIT')
    return { success: true, id, expenseNumber: res.rows[0]?.expense_number }
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (typeof err?.message === 'string' && err.message.includes('Company not found')) {
      throw createError({ statusCode: 404, statusMessage: 'Company not found' })
    }
    throw err
  } finally {
    client.release()
  }
})
