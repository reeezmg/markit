import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { insertSalaryPaymentInClient } from './_payment'
import { upsertUserLedgerEntry } from '~/server/utils/user-ledger'
import { ensureAccountLedgerSchema, rebuildAccountLedgerForSource, userCreditAccountLedgerRows } from '~/server/utils/account-ledger'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody<{
    userId?: string
    salaryAmount?: number
    creditCutAmount?: number
    paymentMode?: 'CASH' | 'BANK' | 'UPI'
    bankAccountId?: string | null
    paymentDate?: string
    note?: string | null
    cycleId?: string | null
    cycleLineId?: string | null
  }>(event)

  const salaryAmount = round2(Number(body.salaryAmount || 0))
  const creditCutAmount = round2(Number(body.creditCutAmount || 0))
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'User is required' })
  if (salaryAmount <= 0 && creditCutAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Enter salary payment or credit cut amount' })
  }
  if (creditCutAmount > 0 && !body.cycleLineId) {
    throw createError({ statusCode: 400, statusMessage: 'Cycle line is required for credit cut' })
  }

  const client = await pool.connect()
  try {
    await ensureAccountLedgerSchema(client)
    await client.query('BEGIN')

    const userRes = await client.query(
      `
      SELECT 1
      FROM company_users
      WHERE company_id = $1
        AND user_id = $2
        AND deleted = false
      LIMIT 1
      `,
      [companyId, body.userId],
    )
    if (!userRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'User not found' })

    const existingCreditCutRes = body.cycleLineId
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
          [companyId, body.cycleLineId],
        )
      : { rows: [] }
    const previousCreditCut = Number(existingCreditCutRes.rows[0]?.amount || 0)

    let payment: { paymentId: string; moneyTransactionId: string } | null = null
    if (salaryAmount > 0) {
      payment = await insertSalaryPaymentInClient(client, companyId, {
        userId: body.userId,
        amount: salaryAmount,
        type: 'SALARY',
        paymentMode: body.paymentMode,
        bankAccountId: body.bankAccountId || null,
        paymentDate: body.paymentDate,
        note: body.note || null,
        cycleId: body.cycleId || null,
        cycleLineId: body.cycleLineId || null,
        ledgerAmount: round2(salaryAmount + creditCutAmount),
      })
    }

    let creditCut: any = null
    if (creditCutAmount > 0) {
      if (salaryAmount <= 0) {
        const existingSalarySettlementRes = await client.query(
          `
          SELECT amount
          FROM user_ledger_entries
          WHERE company_id = $1
            AND source_type = 'PAYROLL'
            AND source_id = $2
            AND type = 'SALARY_PAYMENT'
          LIMIT 1
          `,
          [companyId, `${body.cycleLineId}:salary-settlement`],
        )
        await upsertUserLedgerEntry(client, {
          companyId,
          userId: body.userId,
          type: 'SALARY_PAYMENT',
          direction: 'DEBIT',
          sourceType: 'PAYROLL',
          sourceId: `${body.cycleLineId}:salary-settlement`,
          amount: round2(Number(existingSalarySettlementRes.rows[0]?.amount || 0) + creditCutAmount),
          note: body.note || 'Salary settled against user credit',
          createdAt: body.paymentDate || null,
        })
      }

      creditCut = await upsertUserLedgerEntry(client, {
        companyId,
        userId: body.userId,
        type: 'CREDIT_BILL_PAYMENT',
        direction: 'CREDIT',
        sourceType: 'PAYROLL',
        sourceId: body.cycleLineId || null,
        amount: round2(previousCreditCut + creditCutAmount),
        note: body.note || 'Credit reduced from payroll cycle',
        createdAt: body.paymentDate || null,
      })

      if (creditCut?.id) {
        await rebuildAccountLedgerForSource(client, {
          companyId,
          sourceType: 'USER_CREDIT',
          sourceId: creditCut.id,
          rows: userCreditAccountLedgerRows({
            id: creditCut.id,
            companyId,
            type: 'CREDIT_BILL_PAYMENT',
            sourceType: 'PAYROLL',
            sourceId: body.cycleLineId || null,
            amount: round2(previousCreditCut + creditCutAmount),
            createdAt: body.paymentDate || null,
            note: body.note || 'Credit reduced from payroll cycle',
          }),
        })
      }
    }

    await client.query('COMMIT')
    return { success: true, payment, creditCut }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
