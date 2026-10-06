import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultShiftPolicy, shiftForDate } from '../utils/shift-policy'
import { openOvernightAttendance, overnightAttendanceWindow } from '../utils/overnight-attendance'
import { validateShiftSettings, appendShiftVersion } from '../server/utils/shift-settings'
import { validateLeave } from '../server/utils/leave-settings'
import { computeUserLine, evaluateAttendanceDay, shiftHoursOf, type DayInput } from '../server/utils/payroll'
import { buildShiftCalendar } from '../server/utils/shift-calendar'

const at = (day: string, time = '00:00') => new Date(`${day}T${time}:00`)
const policy = (rules: Record<string, unknown> = {}) => ({ ...defaultShiftPolicy, ...rules })
const shift = (rules: Record<string, unknown> = {}) => ({ id: 's', name: 'Day', startTime: '09:00', endTime: '18:00', breakMinutes: 60,
    workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], holidayPaid: true,
    leaveCutFullDay: 800, leaveCutHalfDay: 400, leaveCutPerHour: 100, policy: policy(rules),
})
const logs = (date: string, ...times: string[]) => times.map((time, i) => ({ type: i % 2 ? 'CHECK_OUT' : 'CHECK_IN', punchedAt: at(date, time) }))
const day = (rules: Record<string, unknown> = {}, times = ['09:00','18:00']): DayInput => ({ date: '2026-09-29', shift: shift(rules), status: 'PRESENT', logs: logs('2026-09-29', ...times) })
const pay = (days: DayInput[]) => computeUserLine({ period: 'DAILY', amount: 800 }, days, { totalDays: days.length, adjustmentTotal: 0 })

test('automatic break deducts the missing allowance exactly once', () => {
    assert.equal(evaluateAttendanceDay(day({ breakDeduction: 'AUTOMATIC' })).worked, 8)
    assert.equal(evaluateAttendanceDay(day({ breakDeduction: 'AUTOMATIC' }, ['09:00','12:00','12:30','18:00'])).worked, 8)
    assert.equal(evaluateAttendanceDay(day({ breakDeduction: 'AUTOMATIC' }, ['09:00','12:00','13:00','18:00'])).worked, 8)
    assert.equal(evaluateAttendanceDay(day({ breakDeduction: 'AUTOMATIC', breakAfterMinutes: 360 }, ['09:00','12:00'])).worked, 3)
})
test('paid breaks add only recorded time up to the allowance', () => {
    const d = day({ breakPay: 'PAID' }, ['09:00','12:00','13:30','18:00'])
    assert.equal(evaluateAttendanceDay(d).worked, 8.5)
    assert.equal(shiftHoursOf(d.shift), 9)
})
test('full and half day thresholds include exact boundaries', () => {
    const rules = { autoClassify: true, fullDayMinutes: 480, halfDayMinutes: 240 }
    assert.equal(evaluateAttendanceDay(day(rules, ['09:00','17:00'])).status, 'PRESENT')
    assert.equal(evaluateAttendanceDay(day(rules, ['09:00','13:00'])).status, 'HALF_DAY')
    assert.equal(evaluateAttendanceDay(day(rules, ['09:00','12:59'])).status, 'ABSENT')
})
test('missing checkout policies block, classify, or use scheduled end', () => {
    assert.throws(() => pay([day({ missingCheckout: 'REVIEW' }, ['09:00'])]), /Missing checkout/)
    assert.equal(pay([day({ missingCheckout: 'ABSENT' }, ['09:00'])]).netPay, 0)
    assert.equal(pay([day({ missingCheckout: 'HALF_DAY' }, ['09:00'])]).netPay, 400)
    assert.equal(evaluateAttendanceDay(day({ missingCheckout: 'SHIFT_END', breakDeduction: 'AUTOMATIC' }, ['09:00'])).worked, 8)
})
test('weekly-off work earns extra hourly pay without a second daily base salary', () => {
    const d = { ...day({ weeklyOffMode: 'PAY', weeklyOffHourlyRate: 200, breakDeduction: 'AUTOMATIC' }), isWeeklyOff: true }
    const result = pay([d])
    assert.equal(result.expectedDays, 0)
    assert.equal(result.overtimeAmount, 1600)
    assert.equal(result.netPay, 1600)
})
test('holiday pay takes priority over weekly-off pay and normal overtime', () => {
    const d = day({ weeklyOffMode: 'PAY', weeklyOffHourlyRate: 100, holidayWorkMode: 'PAY', holidayHourlyRate: 300, breakDeduction: 'AUTOMATIC' })
    d.isWeeklyOff = true; d.isHoliday = true
    assert.equal(pay([d]).overtimeAmount, 2400)
})
test('unpaid holiday attendance status is not silently paid', () => {
    const d = { ...day(), status: 'HOLIDAY' as const, logs: [], isHoliday: true, shift: { ...shift(), holidayPaid: false } }
    assert.equal(pay([d]).netPay, 0)
})
const calendar = (s: any, leaves: any[], attendances: any[] = [], from = '2026-09-01', to = '2026-09-30', holidays = new Set<string>()) => buildShiftCalendar({
    assignments: [{ id: 'assignment', effectiveFrom: at('2026-09-01'), effectiveTo: null, shift: s }],
    leaves, attendances, holidays, from: at(from), to: at(to),
})
const leave = (id: string, date: string, type = 'CASUAL', units = 1) => ({ id, startDate: at(date), endDate: at(date), days: units, type, status: 'APPROVED' })
test('approved typed leaves consume one monthly balance across separate payroll periods', () => {
    const s = { ...shift({ typedLeaveEnabled: true }), casualLeaveDays: 1, casualLeavePeriod: 'MONTHLY' }
    const leaves = [leave('a', '2026-09-02'), leave('b', '2026-09-17')]
    const full = calendar(s, leaves)
    const later = calendar(s, leaves, [], '2026-09-16')
    assert.equal(full.days.find(d => d.date === '2026-09-02')!.paidLeaveUnits, 1)
    assert.equal(later.days.find(d => d.date === '2026-09-17')!.paidLeaveUnits, 0)
    assert.equal(full.balances.CASUAL.used, 1)
})
test('pending leave does not consume entitlement; half-day leave uses fractional allowance', () => {
    const s = { ...shift({ typedLeaveEnabled: true }), casualLeaveDays: 1, casualLeavePeriod: 'MONTHLY' }
    const result = calendar(s, [{ ...leave('pending', '2026-09-01'), status: 'PENDING' }, leave('half', '2026-09-02', 'CASUAL', 0.5)])
    assert.equal(result.balances.CASUAL.used, 0.5)
    assert.equal(result.days.find(d => d.date === '2026-09-02')!.paidLeaveUnits, 0.5)
})
test('paid holiday does not consume an approved leave allowance', () => {
    const s = { ...shift({ typedLeaveEnabled: true }), casualLeaveDays: 1 }
    assert.equal(calendar(s, [leave('a', '2026-09-02')], [], '2026-09-01', '2026-09-30', new Set(['2026-09-02'])).balances.CASUAL.used, 0)
})
test('compensatory leave is earned once, consumed chronologically, and reruns are stable', () => {
    const s = shift({ weeklyOffMode: 'COMP_OFF', compOffMinMinutes: 240 })
    const attendance = { date: at('2026-09-06'), status: 'PRESENT', logs: logs('2026-09-06','09:00','14:00'), shift: s }
    const result = calendar(s, [leave('comp', '2026-09-07', 'COMP_OFF')], [attendance])
    assert.equal(result.compOffEarned, 1)
    assert.equal(result.compOffUsed, 1)
    assert.equal(result.compOffBalance, 0)
    assert.equal(result.days.find(d => d.date === '2026-09-07')!.paidLeaveUnits, 1)
    assert.deepEqual(calendar(s, [leave('comp', '2026-09-07', 'COMP_OFF')], [attendance]), result)
})
test('comp-off expiry and incomplete punches prevent invalid credits', () => {
    const s = shift({ weeklyOffMode: 'COMP_OFF', compOffExpiryDays: 1 })
    const attendance = { date: at('2026-09-06'), status: 'PRESENT', logs: logs('2026-09-06','09:00','14:00'), shift: s }
    assert.equal(calendar(s, [leave('comp', '2026-09-08', 'COMP_OFF')], [attendance]).compOffUsed, 0)
    assert.equal(calendar(s, [], [{ ...attendance, logs: logs('2026-09-06', '09:00') }]).compOffEarned, 0)
})
test('saved versions preserve earlier policies and reject backdating or replacing a version', () => {
    const before = shift()
    const after = { ...before, lateEntryFine: 100 }
    const history = appendShiftVersion(before, after, '2026-10-01', '2026-09-29')
    const saved = { ...after, policyHistory: history }
    assert.equal((shiftForDate(saved, '2026-09-30') as any).lateEntryFine, null)
    assert.equal(shiftForDate(saved, '2026-10-01').lateEntryFine, 100)
    assert.throws(() => appendShiftVersion(saved, after, '2026-10-01', '2026-09-29'))
    assert.throws(() => appendShiftVersion(before, after, '2026-09-28', '2026-09-29'))
})
test('shift validation rejects invalid time, negative rate, excessive break and inconsistent thresholds', () => {
    assert.throws(() => validateShiftSettings({ ...shift(), startTime: '25:00' }))
    assert.throws(() => validateShiftSettings({ ...shift(), overtimeRate: -1 }))
    assert.throws(() => validateShiftSettings({ ...shift(), breakMinutes: 600 }))
    assert.throws(() => validateShiftSettings(shift({ autoClassify: true, halfDayMinutes: 600 })))
    assert.throws(() => validateShiftSettings({ ...shift(), endTime: '09:00' }))
})
test('overnight checkout uses previous attendance and enforces the grace window', () => {
    const today = at('2026-09-30')
    const att = { date: at('2026-09-29'), shift: { ...shift(), startTime: '22:00', endTime: '06:00' }, logs: logs('2026-09-29','22:00') }
    assert.equal(openOvernightAttendance(att, today, '2026-09-30', at('2026-09-30','06:30')), true)
    assert.equal(openOvernightAttendance(att, today, '2026-09-30', at('2026-09-30','10:01')), false)
    assert.equal(openOvernightAttendance({ ...att, shift: shift() }, today, '2026-09-30', at('2026-09-30','06:30')), false)
})
test('leave validation rejects impossible dates and quantities and accepts compensatory leave', () => {
    const input = { userId: 'u', type: 'COMP_OFF', startDate: '2026-09-29', endDate: '2026-09-29', days: 0.5, reason: 'Rest' }
    assert.equal(validateLeave(input).type, 'COMP_OFF')
    assert.throws(() => validateLeave({ ...input, days: 2 }))
    assert.throws(() => validateLeave({ ...input, days: 0.3 }))
    assert.throws(() => validateLeave({ ...input, startDate: '2026-02-30' }))
})

test('partial approved leave and worked half-day do not cause a second half-day deduction', () => {
    const d = { ...day({ autoClassify: true }, ['13:00','17:00']), leaveUnits: 0.5, paidLeaveUnits: 0.5 }
    assert.equal(pay([d]).netPay, 800)
    assert.equal(pay([{ ...d, paidLeaveUnits: 0 }]).netPay, 400)
})
test('monthly entitlements reset rather than sharing September usage with October', () => {
    const s = { ...shift({ typedLeaveEnabled: true }), casualLeaveDays: 1, casualLeavePeriod: 'MONTHLY' }
    const result = calendar(s, [leave('sep', '2026-09-02'), leave('oct', '2026-10-01')], [], '2026-10-01', '2026-10-31')
    assert.equal(result.days.find(d => d.date === '2026-10-01')!.paidLeaveUnits, 1)
    assert.equal(result.balances.CASUAL.used, 1)
})
test('returning from a break after midnight uses the prior night window', () => {
    const today = at('2026-09-30')
    const att = { date: at('2026-09-29'), shift: { ...shift(), startTime: '22:00', endTime: '06:00' },
        logs: [{ type: 'CHECK_IN', punchedAt: at('2026-09-29','22:00') }, { type: 'CHECK_OUT', punchedAt: at('2026-09-30','01:00') }] }
    assert.equal(openOvernightAttendance(att, today, '2026-09-30', at('2026-09-30','01:30')), false)
    assert.equal(overnightAttendanceWindow(att, today, '2026-09-30', at('2026-09-30','01:30')), true)
    assert.equal(overnightAttendanceWindow(att, today, '2026-09-30', at('2026-09-30','07:00')), false)
})
