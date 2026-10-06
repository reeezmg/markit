/** Versioned rules shared by the shift form, attendance and payroll. */
export const defaultShiftPolicy = {
    breakPay: 'UNPAID', breakDeduction: 'RECORDED', breakAfterMinutes: 0,
    weeklyOffMode: 'NONE', weeklyOffHourlyRate: 0,
    holidayWorkMode: 'NONE', holidayHourlyRate: 0,
    compOffMinMinutes: 240, compOffExpiryDays: 90,
    autoClassify: false, fullDayMinutes: 480, halfDayMinutes: 240,
    missingCheckout: 'LEGACY', overnightCheckoutHours: 4,
    typedLeaveEnabled: false,
}
export type ShiftPolicy = typeof defaultShiftPolicy
export function shiftPolicy(shift: any): ShiftPolicy {
    return { ...defaultShiftPolicy, ...(shift?.policy && typeof shift.policy === 'object' ? shift.policy : {}) }
}
export const shiftSnapshotFields = [
    'name', 'startTime', 'endTime', 'workDays', 'breakMinutes', 'overtimeMode', 'overtimeRate',
    'otDailyThresholdMinutes', 'otHourlyRoundMinutes', 'leaveCutFullDay', 'leaveCutHalfDay',
    'leaveCutPerHour', 'paidLeaveDays', 'casualLeaveDays', 'casualLeavePeriod', 'sickLeaveDays',
    'sickLeavePeriod', 'earnedLeaveDays', 'earnedLeavePeriod', 'otherLeaveDays', 'otherLeavePeriod',
    'holidayPaid', 'lateEntryGraceMinutes', 'lateEntryFine', 'earlyExitGraceMinutes', 'earlyExitFine', 'policy',
]
export function shiftSnapshot(shift: any): Record<string, any> {
    return JSON.parse(JSON.stringify(Object.fromEntries(shiftSnapshotFields.map(key => [key, shift[key] ?? null]))))
}
export function shiftForDate<T>(shift: T, date: string | Date): T {
    if (!shift) return shift
    const key = typeof date === 'string' ? date.slice(0, 10) : localDateKey(date)
    const history = (shift as any).policyHistory
    if (!Array.isArray(history)) return shift
    const version = [...history].filter(v => v.effectiveFrom <= key).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    return version ? { ...shift, ...version.values } : shift
}
export function localDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function shiftDurationMinutes(start: string, end: string) {
    const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3))
    const duration = minutes(end) - minutes(start)
    return duration <= 0 ? duration + 1440 : duration
}
