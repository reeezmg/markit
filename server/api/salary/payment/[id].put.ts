import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { moneyTransactionLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'
import { recalculateManyUserLedgerBalances, upsertUserLedgerEntry } from '~/server/utils/user-ledger'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const paymentId = event.context.params?.id
  if (!paymentId) throw createError({ statusCode: 400, statusMessage: 'payment id is required' })

  const body = await readBody<{
    userId?: string
    amount?: number
    type?: 'SALARY' | 'ADVANCE'
    paymentMode?: 'CASH' | 'BANK' | 'UPI'
    bankAccountId?: string | null
    paymentDate?: string
    note?: string | null
  }>(event)

  const amount = round2(Number(body.amount || 0))
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const paymentRes = await client.query(
      `
      SELECT id, user_id, cycle_id, cycle_line_id, money_transaction_id
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
    const accountId = mode === 'BANK' ? body.bankAccountId || null : null
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
      await rebuildAccountLedgerForSource(client, {
        companyId,
        sourceType: 'MONEY_TRANSACTION',
        sourceId: existing.money_transaction_id,
        rows: moneyTransactionLedgerRows({
          id: existing.money_transaction_id,
          companyId,
          amount,
          paymentMode: ledgerMode,
          accountId,
          direction: 'GIVEN',
          status: 'PAID',
          createdAt: when,
          note: body.note || 'Salary payment',
        }),
      })
    }

    const creditCutRes = cycleLineId
      ? await client.query(
          `
          SELECT amount
          FROM user_ledger_entries
          WHERE company_id = $1
            AND source_type = 'PAYROLL'
            AND source_id = $2
            AND type = 'CREDIT_BILL_PAYMENT'
          LIMIT 1
          `,
          [companyId, cycleLineId],
        )
      : { rows: [] }
    const ledgerAmount = round2(amount + Number(creditCutRes.rows[0]?.amount || 0))

    await upsertUserLedgerEntry(client, {
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
