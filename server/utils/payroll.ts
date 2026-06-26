// server/utils/payroll.ts
// Pure payroll math — no prisma/h3 imports so it is unit-testable in isolation.
// Used by server/api/salary/payroll/run.post.ts.

export type SalaryPeriodT = 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY'
export type OvertimeModeT = 'NONE' | 'HOURLY' | 'DAILY'
export type AttendanceStatusT = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | null

export interface SalaryCfgLike {
    period: SalaryPeriodT
    amount: number
    commissionPercentage?: number | null
}

export interface ShiftLike {
    startTime: string // "HH:mm"
    endTime: string // "HH:mm"
    workDays?: string[] | null
    breakMinutes?: number | null
    overtimeMode?: OvertimeModeT | null
    overtimeRate?: number | null
    otDailyThresholdMinutes?: number | null
    otHourlyRoundMinutes?: number | null
    leaveCutFullDay?: number | null
    leaveCutHalfDay?: number | null
    leaveCutPerHour?: number | null
    paidLeaveDays?: number | null
    holidayPaid?: boolean | null
    lateEntryGraceMinutes?: number | null
    lateEntryFine?: number | null
    earlyExitGraceMinutes?: number | null
    earlyExitFine?: number | null
}

export interface DayInput {
    shift: ShiftLike | null // resolved shift for the day (attendance.shift ?? assignment.shift)
    status: AttendanceStatusT // null = no attendance row that day
    logs: { type: string; punchedAt: string | Date }[]
    checkInAt?: string | Date | null
    checkOutAt?: string | Date | null
    isHoliday?: boolean
}

export interface LineResult {
    expectedDays: number
    presentDays: number
    absentDays: number
    halfDays: number
    leaveDeduction: number
    lateEntryFine: number
    earlyExitFine: number
    overtimeHours: number
    overtimeAmount: number
    commissionSales: number
    commissionAmount: number
    baseSalary: number
    grossPay: number
    netPay: number
    adjustmentTotal: number
}

export interface MonthlySalarySegment {
    days: number
    daysInMonth: number
}

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Hours between two "HH:mm" strings minus break; handles overnight shifts. */
export function shiftHoursOf(shift: ShiftLike | null): number {
    if (!shift?.startTime || !shift?.endTime) return 0
    const [sh, sm] = shift.startTime.split(':').map(Number)
    const [eh, em] = shift.endTime.split(':').map(Number)
    let mins = eh * 60 + em - (sh * 60 + sm)
    if (mins <= 0) mins += 24 * 60
    mins -= shift.breakMinutes ?? 0
    return Math.max(0, mins / 60)
}

/** Worked hours from CHECK_IN/CHECK_OUT pairs; falls back to check-in/out times. */
export function workedHoursOf(
    logs: { type: string; punchedAt: string | Date }[],
    checkInAt?: string | Date | null,
    checkOutAt?: string | Date | null,
): number {
    const sorted = [...(logs ?? [])].sort(
        (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
    )
    let total = 0
    let openIn: Date | null = null
    for (const l of sorted) {
        if (l.type === 'CHECK_IN') {
            if (!openIn) openIn = new Date(l.punchedAt)
        } else if (l.type === 'CHECK_OUT' && openIn) {
            total += Math.max(0, (new Date(l.punchedAt).getTime() - openIn.getTime()) / 3.6e6)
            openIn = null
        }
    }
    if (total === 0 && checkInAt && checkOutAt) {
        total = Math.max(0, (new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 3.6e6)
    }
    return total
}

function punchTimeOf(
    logs: { type: string; punchedAt: string | Date }[],
    type: 'CHECK_IN' | 'CHECK_OUT',
    fallback?: string | Date | null,
): Date | null {
    const punches = [...(logs ?? [])]
        .filter((l) => l.type === type)
        .map((l) => new Date(l.punchedAt))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())
    if (punches.length) return type === 'CHECK_IN' ? punches[0] : punches[punches.length - 1]
    if (!fallback) return null
    const d = new Date(fallback)
    return isNaN(d.getTime()) ? null : d
}

function shiftBoundaryForPunch(shift: ShiftLike | null, punch: Date | null, boundary: 'start' | 'end'): Date | null {
    if (!shift || !punch) return null
    const time = boundary === 'start' ? shift.startTime : shift.endTime
    if (!time) return null

    const [h, m] = time.split(':').map(Number)
    const boundaryAt = new Date(punch)
    boundaryAt.setHours(h, m, 0, 0)

    const [sh, sm] = shift.startTime.split(':').map(Number)
    const [eh, em] = shift.endTime.split(':').map(Number)
    const isOvernight = eh * 60 + em <= sh * 60 + sm

    if (boundary === 'start' && isOvernight && punch.getHours() < eh) {
        boundaryAt.setDate(boundaryAt.getDate() - 1)
    }
    if (boundary === 'end' && isOvernight && punch.getHours() >= sh) {
        boundaryAt.setDate(boundaryAt.getDate() + 1)
    }

    return boundaryAt
}

/**
 * Compute a payroll line for one user from their expected (shift-covered) days.
 * `days` contains ONLY days the user is assigned a shift in the period.
 * `totalDays` = calendar days in the pay period.
 * `monthlySegments` = calendar-day slices per month in the pay period.
 */
export function computeUserLine(
    cfg: SalaryCfgLike,
    days: DayInput[],
    opts: {
        totalDays: number
        monthlyDays?: number
        monthlySegments?: MonthlySalarySegment[]
        adjustmentTotal: number
        commissionSales?: number
    },
): LineResult {
    const num = (v: any) => Number(v ?? 0)

    let expectedDays = 0
    let presentDays = 0
    let absentDays = 0
    let halfDays = 0
    let leaveDeduction = 0
    let lateEntryFine = 0
    let earlyExitFine = 0
    let overtimeHours = 0
    let overtimeAmount = 0
    let expectedHours = 0
    const paidLeaveAllowance = Math.max(0, days.reduce((max, day) => Math.max(max, num(day.shift?.paidLeaveDays)), 0))
    let paidLeavesUsed = 0

    for (const day of days) {
        expectedDays++
        const shiftHrs = shiftHoursOf(day.shift)
        expectedHours += shiftHrs
        const overtimeMode = day.shift?.overtimeMode ?? 'NONE'
        const overtimeRate = num(day.shift?.overtimeRate)
        const otDailyThresholdMinutes = num(day.shift?.otDailyThresholdMinutes)
        const otHourlyRoundMinutes = num(day.shift?.otHourlyRoundMinutes)
        const leaveCutFullDay = num(day.shift?.leaveCutFullDay)
        const leaveCutHalfDay = num(day.shift?.leaveCutHalfDay)
        const leaveCutPerHour = num(day.shift?.leaveCutPerHour)
        const holidayPaid = day.shift?.holidayPaid ?? true
        const lateEntryGraceMinutes = num(day.shift?.lateEntryGraceMinutes)
        const lateEntryFinePerDay = num(day.shift?.lateEntryFine)
        const earlyExitGraceMinutes = num(day.shift?.earlyExitGraceMinutes)
        const earlyExitFinePerDay = num(day.shift?.earlyExitFine)
        const status = day.status ?? 'ABSENT'
        const hasPunch = Boolean((day.logs && day.logs.length) || day.checkInAt)

        if (!day.status || status === 'ABSENT' || status === 'LEAVE') {
            if (day.isHoliday && holidayPaid) {
                presentDays++
                continue
            }
            if (paidLeavesUsed < paidLeaveAllowance) {
                paidLeavesUsed++
                presentDays++
                continue
            }
            absentDays++
            leaveDeduction += leaveCutFullDay
            continue
        }
        if (status === 'HALF_DAY') {
            halfDays++
            const halfShiftCut = shiftHrs > 0 && leaveCutPerHour > 0
                ? (shiftHrs / 2) * leaveCutPerHour
                : leaveCutHalfDay
            leaveDeduction += halfShiftCut
            if (!hasPunch) continue
        } else {
            presentDays++
        }

        const worked = workedHoursOf(day.logs, day.checkInAt, day.checkOutAt)
        const firstCheckIn = punchTimeOf(day.logs, 'CHECK_IN', day.checkInAt)
        const lastCheckOut = punchTimeOf(day.logs, 'CHECK_OUT', day.checkOutAt)
        const shiftStart = shiftBoundaryForPunch(day.shift, firstCheckIn, 'start')
        const shiftEnd = shiftBoundaryForPunch(day.shift, lastCheckOut, 'end')

        if (shiftStart && firstCheckIn && lateEntryFinePerDay > 0) {
            const lateMinutes = (firstCheckIn.getTime() - shiftStart.getTime()) / 60000
            if (lateMinutes > lateEntryGraceMinutes) lateEntryFine += lateEntryFinePerDay
        }
        if (shiftEnd && lastCheckOut && earlyExitFinePerDay > 0) {
            const earlyMinutes = (shiftEnd.getTime() - lastCheckOut.getTime()) / 60000
            if (earlyMinutes > earlyExitGraceMinutes) earlyExitFine += earlyExitFinePerDay
        }

        if (status !== 'HALF_DAY') {
            const short = Math.max(0, shiftHrs - worked)
            leaveDeduction += short * leaveCutPerHour
        }

        const otHrs = Math.max(0, worked - shiftHrs)
        if (otHrs > 0 && overtimeMode !== 'NONE') {
            const otMin = otHrs * 60
            if (overtimeMode === 'HOURLY') {
                const full = Math.floor(otHrs)
                const remMin = otMin - full * 60
                const rounded = otHourlyRoundMinutes > 0 && remMin >= otHourlyRoundMinutes ? full + 1 : full
                overtimeHours += rounded
                overtimeAmount += rounded * overtimeRate
            } else if (overtimeMode === 'DAILY') {
                if (otMin >= otDailyThresholdMinutes) {
                    overtimeHours += otHrs
                    overtimeAmount += overtimeRate
                }
            }
        }
    }

    const amount = num(cfg.amount)
    const commissionSales = num(opts.commissionSales)
    const commissionPercentage = num(cfg.commissionPercentage)
    const commissionAmount = commissionSales * commissionPercentage / 100
    let periodSalary = amount
    if (cfg.period === 'MONTHLY') {
        if (opts.monthlySegments?.length) {
            periodSalary = opts.monthlySegments.reduce((sum, segment) => {
                const days = num(segment.days)
                const daysInMonth = num(segment.daysInMonth)
                return daysInMonth > 0 ? sum + amount * (days / daysInMonth) : sum
            }, 0)
        } else {
            const monthlyDays = opts.monthlyDays && opts.monthlyDays > 0 ? opts.monthlyDays : 30
            periodSalary = amount * (opts.totalDays / monthlyDays)
        }
    } else if (cfg.period === 'WEEKLY') periodSalary = amount * (opts.totalDays / 7)
    else if (cfg.period === 'DAILY') periodSalary = amount * expectedDays
    else if (cfg.period === 'HOURLY') periodSalary = amount * expectedHours

    const adjustmentTotal = num(opts.adjustmentTotal)
    const grossPay = periodSalary + overtimeAmount + commissionAmount
    const fineTotal = lateEntryFine + earlyExitFine
    const netPay = periodSalary - leaveDeduction - fineTotal + overtimeAmount + commissionAmount + adjustmentTotal

    return {
        expectedDays,
        presentDays,
        absentDays,
        halfDays,
        leaveDeduction: round2(leaveDeduction),
        lateEntryFine: round2(lateEntryFine),
        earlyExitFine: round2(earlyExitFine),
        overtimeHours: round2(overtimeHours),
        overtimeAmount: round2(overtimeAmount),
        commissionSales: round2(commissionSales),
        commissionAmount: round2(commissionAmount),
        baseSalary: round2(periodSalary),
        grossPay: round2(grossPay),
        netPay: round2(netPay),
        adjustmentTotal: round2(adjustmentTotal),
    }
}

/** due = openingBalance + Σ accrued netPay − Σ payments. */
export function computeDue(openingBalance: number, accrued: number, paid: number): number {
    return round2(Number(openingBalance ?? 0) + Number(accrued ?? 0) - Number(paid ?? 0))
}
