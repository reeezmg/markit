import { assertSalaryManager } from '~/server/utils/salary-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

import { deleteUserLedgerEntryForSource, upsertUserLedgerEntry } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const paymentId = event.context.params?.id
  if (!paymentId) throw createError({ statusCode: 400, statusMessage: 'payment id is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    await lockCompanyRequest(event, client)
    const paymentRes = await client.query(
      `
      SELECT id, user_id, amount, payment_date, cycle_line_id, money_transaction_id
      FROM salary_payments
      WHERE id = $1
        AND company_id = $2
      FOR UPDATE
      `,
      [paymentId, companyId],
    )
    if (!paymentRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'Salary payment not found' })

    const payment = paymentRes.rows[0]
    await client.query(
      `DELETE FROM salary_payments WHERE id = $1 AND company_id = $2`,
      [paymentId, companyId],
    )
    if (payment.money_transaction_id) {

      await client.query(
        `DELETE FROM money_transactions WHERE id = $1 AND company_id = $2`,
        [payment.money_transaction_id, companyId],
      )
    }
    // A payroll credit deduction survives deleting its cash payout. Keep its salary
    // settlement leg in the staff ledger; accounting already posts the cut separately.
    const linkedLedger = await client.query(`SELECT amount FROM user_ledger_entries
      WHERE company_id=$1 AND source_type='SALARY_PAYMENT' AND source_id=$2 AND type='SALARY_PAYMENT'`, [companyId,paymentId])
    const attachedCut = Math.max(0, Math.round((Number(linkedLedger.rows[0]?.amount || payment.amount)-Number(payment.amount))*100)/100)
    if (attachedCut > 0 && payment.cycle_line_id) {
      const settlementId = `${payment.cycle_line_id}:salary-settlement`
      const previous = await client.query(`SELECT amount FROM user_ledger_entries WHERE company_id=$1 AND source_type='PAYROLL' AND source_id=$2 AND type='SALARY_PAYMENT'`,[companyId,settlementId])
      await upsertUserLedgerEntry(client,{companyId,userId:payment.user_id,type:'SALARY_PAYMENT',direction:'DEBIT',sourceType:'PAYROLL',sourceId:settlementId,
        amount:Math.round((Number(previous.rows[0]?.amount||0)+attachedCut)*100)/100,note:'Salary settled against user credit',createdAt:payment.payment_date})
    }
    await deleteUserLedgerEntryForSource(client, {
      companyId,
      sourceType: 'SALARY_PAYMENT',
      sourceId: paymentId,
      type: 'SALARY_PAYMENT',
      userId: payment.user_id,
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
