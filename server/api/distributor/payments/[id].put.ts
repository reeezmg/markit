import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { selectDistributorAccounts } from '../../../utils/distributor-account-selection';


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Payment id is required' })
  const body = await readBody<any>(event)
  const amount = Number(body.amount || 0)
  if (!Number.isFinite(amount) || Math.abs(amount*100-Math.round(amount*100))>0.00001 || !['CASH','BANK','UPI','CARD','CHEQUE'].includes(body.paymentType || 'CASH')) throw createError({statusCode:400,statusMessage:'Enter a valid payment mode and an amount with at most two decimals'});
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()
  if (!Number.isFinite(createdAt.getTime())) throw createError({statusCode:400,statusMessage:'Invalid payment date'});

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);
    const res = await client.query(
      `
      UPDATE distributor_payments
      SET amount = $3,
          remarks = $4,
          bill_no = $5,
          payment_type = $6,
          purchase_order_id = $7,
          created_at = $8
      WHERE id = $1 AND company_id = $2 AND purchase_return_id IS NULL
      RETURNING id, expense_id, distributor_id
      `,
      [id, companyId, amount, body.remarks || null, body.billNo || null, body.paymentType || 'CASH', body.purchaseOrderId || null, createdAt],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
    const expenseId = res.rows[0].expense_id
    if (expenseId) {
      const expense = await client.query(`UPDATE expenses SET total_amount=$3, payment_mode=$4, note=$5, expense_date=$6, status='Paid', updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id`, [expenseId, companyId, amount, body.paymentType || 'CASH', body.remarks || null, createdAt])
      if (!expense.rowCount) throw createError({ statusCode: 409, statusMessage: 'Linked expense ownership changed' })

    }

    await selectDistributorAccounts(client,companyId,res.rows[0].distributor_id,`payment:${id}`,body.accountingAccounts);
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
