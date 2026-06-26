import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { computeUserLine, round2, type DayInput, type SalaryCfgLike } from '~/server/utils/payroll'
import { calculateNetSalesByKey } from '~/server/utils/user-sales'
import { pool } from '~/server/db'
import { recalculateManyUserLedgerBalances, recalculateUserLedgerBalances, upsertUserLedgerEntry } from '~/server/utils/user-ledger'

/**
 * Create or recalculate a payroll cycle.
 *
 * Accrual model: each run (re)issues the salary OWED to every shift-assigned
 * user as a PayrollCycleLine.netPay. Re-running replaces the cycle's lines, so
 * there is never double accrual. Payments live in a separate table.
 *
 * Pay = full period salary − leave cuts (full/half/per-hour) + overtime
 *       + signed adjustments for the cycle month.  (math: server/utils/payroll.ts)
 */

interface RunBody {
    cycleId?: string
    name?: string | null
    month?: number
    year?: number
    paymentDate: string
    periodStart: string
    periodEnd: string
    includeUserIds?: string[]
    excludeUserIds?: string[]
}

const MS_DAY = 86400000
const dKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const weekDays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const defaultWorkDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const isShiftWorkDay = (shift: { workDays?: string[] | null } | null | undefined, day: Date) => {
    const workDays = Array.isArray(shift?.workDays) && shift.workDays.length ? shift.workDays : defaultWorkDays
    return workDays.includes(weekDays[day.getDay()])
}

function monthlySalarySegments(start: Date, end: Date): { days: number; daysInMonth: number }[] {
    const segments: { days: number; daysInMonth: number }[] = []
    let cursor = dateOnly(start)
    const last = dateOnly(end)

    while (cursor <= last) {
        const year = cursor.getFullYear()
        const month = cursor.getMonth()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const monthEnd = new Date(year, month, daysInMonth)
        const segmentEnd = monthEnd < last ? monthEnd : last
        const days = Math.floor((segmentEnd.getTime() - cursor.getTime()) / MS_DAY) + 1
        segments.push({ days, daysInMonth })
        cursor = new Date(year, month + 1, 1)
    }

    return segments
}

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<RunBody>(event)
    if (!body?.periodStart || !body?.periodEnd || !body?.paymentDate) {
        throw createError({ statusCode: 400, statusMessage: 'paymentDate, periodStart and periodEnd are required' })
    }

    const periodStart = new Date(body.periodStart)
    const periodEnd = new Date(body.periodEnd)
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid pay period' })
    }
    const cycleMonth = Number(body.month ?? (periodStart.getMonth() + 1))
    const cycleYear = Number(body.year ?? periodStart.getFullYear())
    if (!cycleMonth || !cycleYear) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid cycle month/year' })
    }
    const include = body.includeUserIds ?? []
    const exclude = body.excludeUserIds ?? []
    const totalDays = Math.floor((periodEnd.getTime() - periodStart.getTime()) / MS_DAY) + 1
    const monthlySegments = monthlySalarySegments(periodStart, periodEnd)
    const periodEndInclusive = new Date(periodEnd.getTime() + MS_DAY - 1)
    const cleanup = (session.data as any).cleanup ?? false

    // ─── Create or update the cycle shell ───
    const cycleData = {
        name: body.name ?? null,
        month: cycleMonth,
        year: cycleYear,
        paymentDate: new Date(body.paymentDate),
        periodStart,
        periodEnd,
        includeUserIds: include,
        excludeUserIds: exclude,
        status: 'CALCULATED' as const,
    }
    const cycle = body.cycleId
        ? await prisma.payrollCycle.update({ where: { id: body.cycleId }, data: cycleData })
        : await prisma.payrollCycle.create({ data: { companyId, ...cycleData } })

    // ─── Eligible users: shift-assigned, overlapping period, with a salary config ───
    const assignments = await prisma.shiftAssignment.findMany({
        where: {
            companyId,
            effectiveFrom: { lte: periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
        },
        include: { shift: true },
    })

    let userIds = Array.from(new Set(assignments.map((a) => a.userId)))
    if (include.length) userIds = userIds.filter((id) => include.includes(id))
    if (exclude.length) userIds = userIds.filter((id) => !exclude.includes(id))

    const configs = await prisma.salaryConfig.findMany({ where: { companyId, userId: { in: userIds } } })
    const configByUser = new Map(configs.map((c) => [c.userId, c]))
    userIds = userIds.filter((id) => configByUser.has(id))

    // Attendance for the whole period (with logs + shift), grouped per user/day
    const attendances = await prisma.attendance.findMany({
        where: { companyId, userId: { in: userIds }, date: { gte: periodStart, lte: new Date(periodEnd.getTime() + MS_DAY - 1) } },
        include: { logs: true, shift: true },
    })
    const holidays = await prisma.companyHoliday.findMany({
        where: { companyId, date: { gte: periodStart, lte: periodEndInclusive } },
        select: { date: true },
    })
    const holidayKeys = new Set(holidays.map((h) => dKey(new Date(h.date))))

    const adjustments = await prisma.payrollAdjustment.findMany({
        where: { companyId, userId: { in: userIds }, month: cycleMonth, year: cycleYear, status: 'PENDING' },
    })

    const salesEntries = await prisma.entry.findMany({
        where: {
            companyId,
            userId: { in: userIds },
            bill: {
                deleted: false,
                ...(!cleanup && { precedence: { not: true } }),
                createdAt: { gte: periodStart, lte: periodEndInclusive },
            },
        },
        select: {
            id: true,
            billId: true,
            value: true,
            return: true,
            userId: true,
            bill: { select: { discount: true } },
        },
    })
    const salesByUser = calculateNetSalesByKey(salesEntries, (entry) => entry.userId)

    // ─── Compute each user's line ───
    const lines: any[] = []
    let totalNet = 0

    for (const userId of userIds) {
        const cfg = configByUser.get(userId)!
        const userAssignments = assignments.filter((a) => a.userId === userId)
        const userAtt = attendances.filter((a) => a.userId === userId)
        const attByDay = new Map(userAtt.map((a) => [dKey(new Date(a.date)), a]))

        // Build the list of shift-covered ("expected") days with resolved shift + attendance.
        const days: DayInput[] = []
        for (let t = periodStart.getTime(); t <= periodEnd.getTime(); t += MS_DAY) {
            const day = new Date(t)
            const cover = userAssignments.find(
                (a) => new Date(a.effectiveFrom) <= day && (!a.effectiveTo || new Date(a.effectiveTo) >= day),
            )
            if (!cover) continue
            if (!isShiftWorkDay(cover.shift as any, day)) continue
            const att = attByDay.get(dKey(day))
            days.push({
                shift: (att?.shift ?? cover.shift) as any,
                status: (att?.status ?? null) as any,
                logs: (att?.logs ?? []) as any,
                checkInAt: att?.checkInAt ?? null,
                checkOutAt: att?.checkOutAt ?? null,
                isHoliday: holidayKeys.has(dKey(day)),
            })
        }

        const adjustmentTotal = adjustments
            .filter((a) => a.userId === userId)
            .reduce((s, a) => s + (a.kind === 'ADDITION' ? 1 : -1) * Number(a.amount ?? 0), 0)
        const commissionSales = round2(salesByUser[userId]?.total ?? 0)

        const r = computeUserLine(cfg as unknown as SalaryCfgLike, days, { totalDays, monthlySegments, adjustmentTotal, commissionSales })
        totalNet += r.netPay

        lines.push({
            companyId,
            cycleId: cycle.id,
            userId,
            baseSalary: r.baseSalary,
            expectedDays: r.expectedDays,
            presentDays: r.presentDays,
            absentDays: r.absentDays,
            halfDays: r.halfDays,
            leaveDeduction: r.leaveDeduction,
            lateEntryFine: r.lateEntryFine,
            earlyExitFine: r.earlyExitFine,
            overtimeHours: r.overtimeHours,
            overtimeAmount: r.overtimeAmount,
            commissionSales: r.commissionSales,
            commissionAmount: r.commissionAmount,
            adjustmentTotal: r.adjustmentTotal,
            grossPay: r.grossPay,
            netPay: r.netPay,
        })
    }

    const oldCycleLines = await prisma.payrollCycleLine.findMany({
        where: { companyId, cycleId: cycle.id },
        select: { id: true, userId: true },
    })

    // ─── Replace lines atomically ───
    await prisma.$transaction([
        prisma.payrollCycleLine.deleteMany({ where: { cycleId: cycle.id } }),
        ...(lines.length ? [prisma.payrollCycleLine.createMany({ data: lines })] : []),
        prisma.payrollCycle.update({ where: { id: cycle.id }, data: { totalNet: round2(totalNet) } }),
    ])

    const newCycleLines = await prisma.payrollCycleLine.findMany({
        where: { companyId, cycleId: cycle.id },
        select: { id: true, userId: true },
    })
    const newLineByUser = new Map(newCycleLines.map((line) => [line.userId, line.id]))

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const usersToRecalc = new Set<string>(oldCycleLines.map((line) => line.userId))

        for (const oldLine of oldCycleLines) {
            const newLineId = newLineByUser.get(oldLine.userId)
            if (newLineId) {
                await client.query(
                    `
                    UPDATE salary_payments
                    SET cycle_line_id = $3
                    WHERE company_id = $1
                      AND cycle_id = $2
                      AND cycle_line_id = $4
                    `,
                    [companyId, cycle.id, newLineId, oldLine.id],
                )
                await client.query(
                    `
                    UPDATE user_ledger_entries
                    SET source_id = $3,
                        updated_at = now()
                    WHERE company_id = $1
                      AND source_type = 'PAYROLL'
                      AND source_id = $2
                      AND type = 'CREDIT_BILL_PAYMENT'
                    `,
                    [companyId, oldLine.id, newLineId],
                )
                await client.query(
                    `
                    UPDATE user_ledger_entries
                    SET source_id = $3,
                        updated_at = now()
                    WHERE company_id = $1
                      AND source_type = 'PAYROLL'
                      AND source_id = $2
                      AND type = 'SALARY_PAYMENT'
                    `,
                    [companyId, `${oldLine.id}:salary-settlement`, `${newLineId}:salary-settlement`],
                )
            } else {
                await client.query(
                    `
                    UPDATE salary_payments
                    SET cycle_line_id = NULL
                    WHERE company_id = $1
                      AND cycle_id = $2
                      AND cycle_line_id = $3
                    `,
                    [companyId, cycle.id, oldLine.id],
                )
                await client.query(
                    `
                    DELETE FROM user_ledger_entries
                    WHERE company_id = $1
                      AND source_type = 'PAYROLL'
                      AND (
                        (source_id = $2 AND type = 'CREDIT_BILL_PAYMENT')
                        OR (source_id = $3 AND type = 'SALARY_PAYMENT')
                      )
                    `,
                    [companyId, oldLine.id, `${oldLine.id}:salary-settlement`],
                )
            }
        }

        const oldUsers = await client.query(
            `
            DELETE FROM user_ledger_entries
            WHERE company_id = $1
              AND source_type = 'PAYROLL_CYCLE'
              AND source_id LIKE $2
              AND type = 'PAYROLL_ACCRUAL'
            RETURNING user_id
            `,
            [companyId, `${cycle.id}:%`],
        )
        for (const row of oldUsers.rows) usersToRecalc.add(row.user_id)

        for (const line of lines) {
            await upsertUserLedgerEntry(client, {
                companyId,
                userId: line.userId,
                type: 'PAYROLL_ACCRUAL',
                direction: 'CREDIT',
                amount: line.netPay,
                sourceType: 'PAYROLL_CYCLE',
                sourceId: `${cycle.id}:${line.userId}`,
                note: `Payroll accrual ${cycleMonth}/${cycleYear}`,
                createdAt: body.paymentDate,
            })
            usersToRecalc.add(line.userId)
        }

        await recalculateManyUserLedgerBalances(client, companyId, usersToRecalc)
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }

    return { cycleId: cycle.id, users: lines.length, totalNet: round2(totalNet) }
})
