import { assertSalaryManager, publicSalaryPayment } from '~/server/utils/salary-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

import { recalculateManyUserLedgerBalances, upsertUserLedgerEntry } from '~/server/utils/user-ledger'
import { selectStaffPaymentAccount } from '~/server/utils/staff-payment-account'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const paymentId = event.context.params?.id
  if (!paymentId) throw createError({ statusCode: 400, statusMessage: 'payment id is required' })

  const raw = await readBody(event)
  const validated = publicSalaryPayment({ ...raw, userId: raw?.userId || '_existing' })
  const body = { ...validated, userId: raw?.userId }

  const amount = round2(Number(body.amount || 0))
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    await lockCompanyRequest(event, client)

    const paymentRes = await client.query(
      `
      SELECT id, user_id, amount, cycle_id, cycle_line_id, money_transaction_id, bank_account_id
      FROM salary_payments
      WHERE id = $1
        AND company_id = $2
      FOR UPDATE
      `,
      [paymentId, companyId],
    )
    if (!paymentRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'Salary payment not found' })
    const existing = paymentRes.rows[0]
    const userId = body.userId || existing.user_id

    const userRes = await client.query(
      `
      SELECT 1
      FROM company_users
      WHERE company_id = $1
        AND user_id = $2
        AND deleted = false
      LIMIT 1
      `,
      [companyId, userId],
    )
    if (!userRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'User not found' })

    let cycleLineId = existing.cycle_line_id
    if (existing.cycle_id && userId !== existing.user_id) {
      const lineRes = await client.query(
        `
        SELECT id
        FROM payroll_cycle_lines
        WHERE company_id = $1
          AND cycle_id = $2
          AND user_id = $3
        LIMIT 1
        `,
        [companyId, existing.cycle_id, userId],
      )
      cycleLineId = lineRes.rows[0]?.id || null
    }

    const mode = body.paymentMode || 'CASH'
    const accountId = null
    const ledgerMode = mode === 'UPI' ? 'BANK' : mode
    const when = body.paymentDate ? new Date(body.paymentDate) : new Date()

    await client.query(
      `
      UPDATE salary_payments
      SET user_id = $3,
          amount = $4,
          type = $5,
          payment_mode = $6,
          bank_account_id = $7,
          payment_date = $8,
          note = $9,
          cycle_line_id = $10
      WHERE id = $1
        AND company_id = $2
      `,
      [paymentId, companyId, userId, amount, body.type || 'SALARY', mode, accountId, when, body.note || null, cycleLineId],
    )

    if (existing.money_transaction_id) {
      await client.query(
        `
        UPDATE money_transactions
        SET amount = $3,
            payment_mode = $4,
            account_id = $5,
            note = $6,
            created_at = $7,
            updated_at = now()
        WHERE id = $1
          AND company_id = $2
        `,
        [existing.money_transaction_id, companyId, amount, ledgerMode, accountId, body.note || 'Salary payment', when],
      )

    }

    // Preserve only the credit cut attached to this payout, not every cut in the cycle.
    const originalLedger = await client.query(`SELECT amount FROM user_ledger_entries
      WHERE company_id=$1 AND source_type='SALARY_PAYMENT' AND source_id=$2 AND type='SALARY_PAYMENT'`, [companyId,paymentId])
    const attachedCut = Math.max(0, round2(Number(originalLedger.rows[0]?.amount || existing.amount) - Number(existing.amount)))
    if (attachedCut > 0 && userId !== existing.user_id) throw createError({statusCode:400,statusMessage:'Reverse this salary credit settlement before assigning the payout to another user'})
    const ledgerAmount = round2(amount + attachedCut)

    const ledger = await upsertUserLedgerEntry(client, {
      companyId,
      userId,
      type: 'SALARY_PAYMENT',
      direction: 'DEBIT',
      amount: ledgerAmount,
      sourceType: 'SALARY_PAYMENT',
      sourceId: paymentId,
      note: body.note || 'Salary payment',
      createdAt: when,
    })

    await selectStaffPaymentAccount(client, companyId, ledgerMode, body.bankAccountId, ledger.id, existing.bank_account_id)
    await recalculateManyUserLedgerBalances(client, companyId, [existing.user_id, userId])
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
