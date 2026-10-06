import { localDateKey, shiftForDate, shiftPolicy } from '../../utils/shift-policy'
import { evaluateAttendanceDay, type DayInput } from './payroll'

const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const standardDays = weekdays.slice(1)
const dateOf = (value: string | Date) => new Date(`${localDateKey(new Date(value))}T00:00:00`)
const prefixByType: Record<string, string> = { CASUAL: 'casual', SICK: 'sick', EARNED: 'earned', OTHER: 'other' }
export function leavePeriodKey(date: Date, period: string) {
    if (period === 'YEARLY') return String(date.getFullYear())
    if (period === 'WEEKLY') {
        const monday = new Date(date); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
        return localDateKey(monday)
    }
    return localDateKey(date).slice(0, 7)
}

/** Replay approved leave and off-day work chronologically, independent of payroll run order. */
export function buildShiftCalendar(input: {
    assignments: any[]; attendances: any[]; leaves: any[]; holidays: Set<string>;
    from: Date; to: Date;
}) {
    const { assignments, attendances, holidays } = input
    const leaves = input.leaves.filter(l => l.status === 'APPROVED').sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate) || String(a.id).localeCompare(String(b.id)))
    const byDate = new Map(attendances.map(a => [localDateKey(new Date(a.date)), a]))
    const remaining = new Map(leaves.map(l => [l.id, Number(l.days)]))
    const used = new Map<string, number>()
    const credits: { date: string; expires: Date | null; remaining: number }[] = []
    const days: DayInput[] = []
    let compOffEarned = 0, compOffUsed = 0
    let latestShift: any = null
    const first = Math.min(+dateOf(input.from), ...assignments.map(a => +dateOf(a.effectiveFrom)))
    const sortedAssignments = [...assignments].sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom) || String(a.id).localeCompare(String(b.id)))
    for (const date = new Date(first); date <= input.to; date.setDate(date.getDate() + 1)) {
        const key = localDateKey(date)
        const cover = sortedAssignments.find(a => dateOf(a.effectiveFrom) <= date && (!a.effectiveTo || dateOf(a.effectiveTo) >= date))
        if (!cover) continue
        const att = byDate.get(key)
        const shift: any = shiftForDate(att?.shift ?? cover.shift, key)
        if (!shift) continue
        latestShift = shift
        const policy = shiftPolicy(shift)
        const isWeeklyOff = !(shift.workDays?.length ? shift.workDays : standardDays).includes(weekdays[date.getDay()])
        const isHoliday = holidays.has(key) || att?.status === 'HOLIDAY'
        const day: DayInput = { date: key, shift, isWeeklyOff, isHoliday, status: att?.status ?? null,
            logs: att?.logs ?? [], checkInAt: att?.checkInAt, checkOutAt: att?.checkOutAt,
            skipGenericAllowance: policy.typedLeaveEnabled,
        }
        const compensation = isHoliday ? policy.holidayWorkMode : isWeeklyOff ? policy.weeklyOffMode : 'NONE'
        if (['COMP_OFF', 'BOTH'].includes(compensation)) {
            const measured = evaluateAttendanceDay({ ...day, shift: { ...shift, policy: { ...policy, missingCheckout: 'LEGACY' } } })
            // Missing punches never earn leave credit through an assumed checkout.
            if (!measured.missing && measured.worked * 60 >= policy.compOffMinMinutes) {
                const expires = policy.compOffExpiryDays ? new Date(date) : null
                if (expires) expires.setDate(expires.getDate() + policy.compOffExpiryDays)
                credits.push({ date: key, expires, remaining: 1 })
                if (date >= input.from) compOffEarned++
            }
        }
        if (!isWeeklyOff && !(isHoliday && shift.holidayPaid)) {
            const leave = leaves.find(l => dateOf(l.startDate) <= date && dateOf(l.endDate) >= date && (remaining.get(l.id) ?? 0) > 0)
            if (leave) {
                const units = Math.min(1, remaining.get(leave.id)!)
                remaining.set(leave.id, remaining.get(leave.id)! - units)
                // Working on a booked leave day does not consume entitlement.
                if (!day.logs.length && !day.checkInAt || units < 1) {
                    let paid = 0
                    if (leave.type === 'COMP_OFF') {
                        for (const credit of credits) {
                            if (credit.date >= key || credit.expires && credit.expires < date) continue
                            const take = Math.min(credit.remaining, units - paid)
                            credit.remaining -= take; paid += take
                            if (paid >= units) break
                        }
                        if (date >= input.from) compOffUsed += paid
                    } else if (policy.typedLeaveEnabled) {
                        const prefix = prefixByType[leave.type]
                        const period = shift[`${prefix}LeavePeriod`] ?? 'MONTHLY'
                        const bucket = `${leave.type}:${leavePeriodKey(date, period)}`
                        const allowance = Number(shift[`${prefix}LeaveDays`] ?? 0)
                        paid = Math.min(units, Math.max(0, allowance - (used.get(bucket) ?? 0)))
                        used.set(bucket, (used.get(bucket) ?? 0) + paid)
                    }
                    if (policy.typedLeaveEnabled || leave.type === 'COMP_OFF') {
                        day.leaveUnits = units; day.paidLeaveUnits = paid; day.skipGenericAllowance = true
                        if (!day.checkInAt && !day.logs.length) day.status = 'LEAVE'
                    }
                }
            }
        }
        if (date >= input.from && (!isWeeklyOff || day.logs.length || day.checkInAt)) days.push(day)
    }
    const balances = Object.fromEntries(Object.entries(prefixByType).map(([type, prefix]) => {
        const period = latestShift?.[`${prefix}LeavePeriod`] ?? 'MONTHLY'
        const allowance = Number(latestShift?.[`${prefix}LeaveDays`] ?? 0)
        return [type, { period, allowance, used: used.get(`${type}:${leavePeriodKey(input.to, period)}`) ?? 0 }]
    }))
    return { days, balances, typedLeaveEnabled: shiftPolicy(latestShift).typedLeaveEnabled,
        compOffEarned, compOffUsed,
        compOffBalance: credits.filter(c => !c.expires || c.expires >= input.to).reduce((sum, c) => sum + c.remaining, 0),
    }
}
