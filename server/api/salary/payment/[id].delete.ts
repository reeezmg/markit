import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'
import { deleteAccountLedgerForSource } from '~/server/utils/account-ledger'
import { deleteUserLedgerEntryForSource } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const paymentId = event.context.params?.id
  if (!paymentId) throw createError({ statusCode: 400, statusMessage: 'payment id is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const paymentRes = await client.query(
      `
      SELECT id, user_id, money_transaction_id
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
      await deleteAccountLedgerForSource(client, {
        companyId,
        sourceType: 'MONEY_TRANSACTION',
        sourceId: payment.money_transaction_id,
      })
      await client.query(
        `DELETE FROM money_transactions WHERE id = $1 AND company_id = $2`,
        [payment.money_transaction_id, companyId],
      )
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
