import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { selectDistributorAccounts } from '../../utils/distributor-account-selection';
import { pool } from '~/server/db'


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const amount = Number(body.amount || 0)
  if (!Number.isFinite(amount) || Math.abs(amount*100-Math.round(amount*100))>0.00001 || !['CASH','BANK','UPI','CARD','CHEQUE'].includes(body.paymentType || 'CASH')) throw createError({statusCode:400,statusMessage:'Enter a valid payment mode and an amount with at most two decimals'});
  if (!body.distributorId) throw createError({ statusCode: 400, statusMessage: 'Distributor is required' })
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })
  const createdAt = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date()
  if (!Number.isFinite(createdAt.getTime())) throw createError({statusCode:400,statusMessage:'Invalid payment date'});

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);
    let paymentNo = body.paymentNo || null
    if (paymentNo == null) {
      paymentNo = (await client.query('UPDATE companies SET distributor_payment_counter=distributor_payment_counter+1 WHERE id=$1 RETURNING distributor_payment_counter-1 AS number', [companyId])).rows[0].number
    }
    let expenseId: string | null = null
    if (body.createExpense) {
      const category = await client.query('SELECT id FROM expense_categories WHERE company_id=$1 AND name=$2 ORDER BY id LIMIT 1 FOR SHARE', [companyId, 'Purchase'])
      if (!category.rowCount) throw createError({ statusCode: 409, statusMessage: 'Set up a Purchase expense category for this company first' })
      const number = (await client.query('UPDATE companies SET expense_counter=expense_counter+1 WHERE id=$1 RETURNING expense_counter-1 AS number', [companyId])).rows[0].number
      expenseId = crypto.randomUUID()
      await client.query(`INSERT INTO expenses (id, company_id, expense_number, expense_category_id, total_amount, payment_mode, status, note, expense_date, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'Paid',$7,$8,$8,now())`, [expenseId, companyId, number, category.rows[0].id, amount, body.paymentType || 'CASH', body.remarks || null, createdAt])
    }
    await client.query(
      `
      INSERT INTO distributor_payments
        (id, created_at, payment_no, amount, remarks, bill_no, payment_type, distributor_id, company_id, purchase_order_id, expense_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [id, createdAt, paymentNo, amount, body.remarks || null, body.billNo || null, body.paymentType || 'CASH', body.distributorId, companyId, body.purchaseOrderId || null, expenseId],
    )

    await selectDistributorAccounts(client,companyId,body.distributorId,`payment:${id}`,body.accountingAccounts);
    await client.query('COMMIT')
    return { success: true, id }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
