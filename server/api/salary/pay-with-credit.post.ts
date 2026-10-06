import { assertSalaryManager, salaryMoney, publicSalaryPayment } from '~/server/utils/salary-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { insertSalaryPaymentInClient } from './_payment'
import { upsertUserLedgerEntry } from '~/server/utils/user-ledger'


const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
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

  const salaryAmount = salaryMoney(body.salaryAmount ?? 0, true)
  const creditCutAmount = salaryMoney(body.creditCutAmount ?? 0, true)
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'User is required' })
  if (salaryAmount <= 0 && creditCutAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Enter salary payment or credit cut amount' })
  }
  if (creditCutAmount > 0 && !body.cycleLineId) {
    throw createError({ statusCode: 400, statusMessage: 'Cycle line is required for credit cut' })
  }

  publicSalaryPayment({ userId: body.userId, amount: Math.max(salaryAmount, creditCutAmount), paymentMode: body.paymentMode, bankAccountId: body.bankAccountId, paymentDate: body.paymentDate, note: body.note })
  const client = await pool.connect()
  try {

    await client.query('BEGIN')
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    await lockCompanyRequest(event, client)

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

    if (body.cycleLineId) {
      const line = await client.query('SELECT id FROM payroll_cycle_lines WHERE id=$1 AND company_id=$2 AND user_id=$3 AND cycle_id=$4 FOR UPDATE', [body.cycleLineId, companyId, body.userId, body.cycleId])
      if (!line.rowCount) throw createError({ statusCode: 400, statusMessage: 'Payroll line does not match this staff member and cycle' })
    }
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
