import { expenseTaxAmounts } from '~/utils/expense-tax';
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { validateExpenseParty, markExpensePartyChange, syncExpensePartyLines } from '~/server/utils/expense-party';


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Expense id is required' })
  const body = await readBody<any>(event)
  const totalAmount = Number(body.totalAmount || 0)
  let taxAmounts;
  try { taxAmounts=expenseTaxAmounts(totalAmount,body.taxAmount,body.recoverableTaxAmount); }
  catch(e:any) { throw createError({statusCode:400,statusMessage:e.message}); }
  if (!body.expensecategoryId) throw createError({ statusCode: 400, statusMessage: 'Expense category is required' })
  if (!totalAmount || totalAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const expenseDate = body.expenseDate || body.date ? new Date(body.expenseDate || body.date) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);
    const previous = (await client.query('SELECT from_id AS "userId",distributor_id AS "distributorId",client_id AS "clientId" FROM expenses WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, companyId])).rows[0];
    if (!previous) throw createError({ statusCode: 404, statusMessage: 'Expense not found' });
    if ((await client.query('SELECT id FROM distributor_payments WHERE expense_id=$1 AND company_id=$2', [id, companyId])).rowCount) {
      throw createError({ statusCode: 409, statusMessage: 'Edit this linked expense through its distributor payment' });
    }
    const party = await validateExpenseParty(client, companyId, body, previous);
    await markExpensePartyChange(client, companyId, id, previous, party);
    const res = await client.query(
      `
      UPDATE expenses
      SET from_id = $3,
          distributor_id = $15,
          client_id = $16,
          expense_category_id = $4,
          expense_date = $5,
          note = $6,
          payment_mode = $7,
          status = $8,
          receipt = $9,
          receipt_name = $10,
          tax_amount = $11,
          recoverable_tax_amount = $14,
          total_amount = $12,
          expense_number = COALESCE($13, expense_number),
          updated_at = now()
      WHERE id = $1 AND company_id = $2
      RETURNING id
      `,
      [id, companyId, party.userId, body.expensecategoryId, expenseDate, body.note || null, body.paymentMode || 'CASH', body.status || 'Pending', body.receipt || null, body.receiptName || null, taxAmounts.taxAmount, totalAmount, body.expenseNumber || null, taxAmounts.recoverableTaxAmount, party.distributorId, party.clientId],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Expense not found' })

    await syncExpensePartyLines(client, companyId, [id]);
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
