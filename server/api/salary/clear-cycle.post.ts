import { assertSalaryManager } from '~/server/utils/salary-input'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { insertSalaryPaymentInClient } from './_payment'
import { payrollSql } from '~/server/utils/payroll-transaction'

import { publicSalaryPayment } from '~/server/utils/salary-input'

/**
 * Clear (pay) a payroll cycle — all users or a subset.
 * For each line, pays the outstanding amount (netPay − already paid against
 * that line) as a SALARY payment + mirrored money_transaction. Marks the
 * cycle-month adjustments PROCESSED and flips the cycle to PAID when fully settled.
 */

interface ClearBody {
    cycleId: string
    userIds?: string[] // optional subset; default = all lines in the cycle
    paymentMode?: 'CASH' | 'BANK' | 'UPI'
    bankAccountId?: string | null
    paymentDate?: string
}

const num = (v: any) => Number(v ?? 0)

export default defineEventHandler(async (event) => {
    const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<ClearBody>(event)
    if (!body?.cycleId) throw createError({ statusCode: 400, statusMessage: 'cycleId is required' })

    publicSalaryPayment({ userId: '_cycle', amount: 1, paymentMode: body.paymentMode, bankAccountId: body.bankAccountId, paymentDate: body.paymentDate })

    return prisma.$transaction(async tx => {
    const client = payrollSql(tx)
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    const cycle = await tx.payrollCycle.findFirst({ where: { id: body.cycleId, companyId } })
    if (!cycle) throw createError({ statusCode: 404, statusMessage: 'Cycle not found' })

    let lines = await tx.payrollCycleLine.findMany({ where: { companyId, cycleId: cycle.id } })
    if (body.userIds?.length) lines = lines.filter((l) => body.userIds!.includes(l.userId))

    // sum of payments already made against each line of this cycle
    const paid = await tx.salaryPayment.groupBy({
        by: ['cycleLineId'],
        where: { companyId, cycleId: cycle.id, cycleLineId: { not: null } },
        _sum: { amount: true },
    })
    const paidByLine = new Map(paid.map((p) => [p.cycleLineId, num(p._sum.amount)]))
    const creditCutByLine = await loadCreditCutByLine(client, companyId, lines.map((line) => line.id))
    const carryForwardByUser = await loadCarryForwardByUser(client, companyId, cycle.id, lines.map((line) => ({ id: line.id, userId: line.userId })))

    let paidCount = 0
    let paidTotal = 0
    for (const line of lines) {
        const outstanding = (carryForwardByUser.get(line.userId) ?? 0) + num(line.netPay) - (paidByLine.get(line.id) ?? 0) - (creditCutByLine.get(line.id) ?? 0)
        if (outstanding <= 0.009) continue
        await insertSalaryPaymentInClient(client, companyId, {
            userId: line.userId,
            amount: round2(outstanding),
            type: 'SALARY',
            paymentMode: body.paymentMode ?? 'CASH',
            bankAccountId: body.bankAccountId ?? null,
            paymentDate: body.paymentDate,
            note: `Payroll ${cycle.month}/${cycle.year}`,
            cycleId: cycle.id,
            cycleLineId: line.id,
        })
        paidCount++
        paidTotal += outstanding
    }

    // mark this month's adjustments processed + link to cycle
    await tx.payrollAdjustment.updateMany({
        where: { companyId, userId: { in: lines.map(line => line.userId) }, month: cycle.month, year: cycle.year, status: 'PENDING' },
        data: { status: 'PROCESSED', cycleId: cycle.id },
    })

    // flip to PAID only if every line of the whole cycle is now settled
    const allLines = await tx.payrollCycleLine.findMany({ where: { companyId, cycleId: cycle.id } })
    const freshPaid = await tx.salaryPayment.groupBy({
        by: ['cycleLineId'],
        where: { companyId, cycleId: cycle.id, cycleLineId: { not: null } },
        _sum: { amount: true },
    })
    const freshByLine = new Map(freshPaid.map((p) => [p.cycleLineId, num(p._sum.amount)]))
    const freshCreditCutByLine = await loadCreditCutByLine(client, companyId, allLines.map((line) => line.id))
    const freshCarryForwardByUser = await loadCarryForwardByUser(client, companyId, cycle.id, allLines.map((line) => ({ id: line.id, userId: line.userId })))
    const fullySettled = allLines.every((l) => (freshByLine.get(l.id) ?? 0) + (freshCreditCutByLine.get(l.id) ?? 0) >= (freshCarryForwardByUser.get(l.userId) ?? 0) + num(l.netPay) - 0.009)
    if (fullySettled && allLines.length) {
        await tx.payrollCycle.update({ where: { id: cycle.id }, data: { status: 'PAID' } })
    }

    return { paidUsers: paidCount, paidTotal: round2(paidTotal), cycleStatus: fullySettled ? 'PAID' : cycle.status }
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 120000 })
})

function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100
}

async function loadCreditCutByLine(client: ReturnType<typeof payrollSql>, companyId: string, lineIds: string[]) {
    if (!lineIds.length) return new Map<string, number>()
    const res = await client.query(
        `
        SELECT source_id AS "cycleLineId", SUM(amount) AS amount
        FROM user_ledger_entries
        WHERE company_id = $1
          AND source_type = 'PAYROLL'
          AND type = 'CREDIT_BILL_PAYMENT'
          AND source_id = ANY($2::text[])
        GROUP BY source_id
        `,
        [companyId, lineIds],
    )
    return new Map(res.rows.map((row: any) => [row.cycleLineId, num(row.amount)]))
}

async function loadCarryForwardByUser(client: ReturnType<typeof payrollSql>, companyId: string, cycleId: string, lines: Array<{ id: string; userId: string }>) {
    if (!lines.length) return new Map<string, number>()
    const lineIds = lines.map((line) => line.id)
    const userIds = lines.map((line) => line.userId)
    const res = await client.query(
        `
        SELECT
          ule.user_id AS "userId",
          SUM(CASE WHEN ule.direction = 'CREDIT' THEN ule.amount ELSE -ule.amount END) AS amount
        FROM user_ledger_entries ule
        LEFT JOIN salary_payments sp
          ON ule.company_id = sp.company_id
         AND ule.source_type = 'SALARY_PAYMENT'
         AND ule.source_id = sp.id
        WHERE ule.company_id = $1
          AND ule.user_id = ANY($2::text[])
          AND NOT (
            ule.type = 'PAYROLL_ACCRUAL'
            AND ule.source_type = 'PAYROLL_CYCLE'
            AND ule.source_id = ANY($3::text[])
          )
          AND NOT (
            ule.type = 'SALARY_PAYMENT'
            AND (
              sp.cycle_id = $4
              OR (ule.source_type = 'PAYROLL' AND ule.source_id = ANY($5::text[]))
            )
          )
          AND NOT (
            ule.type = 'CREDIT_BILL_PAYMENT'
            AND ule.source_type = 'PAYROLL'
            AND ule.source_id = ANY($6::text[])
          )
        GROUP BY ule.user_id
        `,
        [
            companyId,
            userIds,
            userIds.map((userId) => `${cycleId}:${userId}`),
            cycleId,
            lineIds.map((lineId) => `${lineId}:salary-settlement`),
            lineIds,
        ],
    )
    return new Map(res.rows.map((row: any) => [row.userId, num(row.amount)]))
}
