import { z } from 'zod'
import { createError } from 'h3'
import { defaultShiftPolicy, shiftDurationMinutes, shiftSnapshot, localDateKey } from '../../utils/shift-policy'

const minutes = z.coerce.number().int().min(0).max(1440)
const amount = z.coerce.number().finite().min(0).max(10000000)
const period = z.enum(['WEEKLY', 'MONTHLY', 'YEARLY'])
const mode = z.enum(['NONE', 'PAY', 'COMP_OFF', 'BOTH'])
const policySchema = z.object({
    breakPay: z.enum(['PAID', 'UNPAID']), breakDeduction: z.enum(['RECORDED', 'AUTOMATIC']), breakAfterMinutes: minutes,
    weeklyOffMode: mode, weeklyOffHourlyRate: amount, holidayWorkMode: mode, holidayHourlyRate: amount,
    compOffMinMinutes: minutes.min(1), compOffExpiryDays: z.coerce.number().int().min(0).max(3650),
    autoClassify: z.boolean(), fullDayMinutes: minutes.min(1), halfDayMinutes: minutes.min(1),
    missingCheckout: z.enum(['LEGACY', 'REVIEW', 'ABSENT', 'HALF_DAY', 'SHIFT_END']),
    overnightCheckoutHours: z.coerce.number().min(0).max(12), typedLeaveEnabled: z.boolean(),
})
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const schema = z.object({
    name: z.string().trim().min(1).max(120), startTime: time, endTime: time,
    workDays: z.array(z.enum(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'])).min(1),
    breakMinutes: minutes.nullable().default(null), overtimeMode: z.enum(['NONE', 'HOURLY', 'DAILY']).default('NONE'),
    overtimeRate: amount.default(0), otDailyThresholdMinutes: minutes.default(0), otHourlyRoundMinutes: minutes.max(59).default(0),
    leaveCutFullDay: amount.default(0), leaveCutHalfDay: amount.default(0), leaveCutPerHour: amount.default(0),
    paidLeaveDays: z.coerce.number().int().min(0).max(366).default(0),
    casualLeaveDays: z.coerce.number().int().min(0).max(366).default(0), casualLeavePeriod: period.default('MONTHLY'),
    sickLeaveDays: z.coerce.number().int().min(0).max(366).default(0), sickLeavePeriod: period.default('MONTHLY'),
    earnedLeaveDays: z.coerce.number().int().min(0).max(366).default(0), earnedLeavePeriod: period.default('YEARLY'),
    otherLeaveDays: z.coerce.number().int().min(0).max(366).default(0), otherLeavePeriod: period.default('MONTHLY'),
    holidayPaid: z.boolean().default(true), lateEntryGraceMinutes: minutes.default(0), lateEntryFine: amount.default(0),
    earlyExitGraceMinutes: minutes.default(0), earlyExitFine: amount.default(0),
    policy: policySchema,
})
export function validateShiftSettings(body: any) {
    const result = schema.safeParse({ ...body, policy: { ...defaultShiftPolicy, ...body?.policy } })
    if (!result.success) throw createError({ statusCode: 400, statusMessage: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
    const data = result.data
    const duration = shiftDurationMinutes(data.startTime, data.endTime)
    if (data.startTime === data.endTime) throw createError({ statusCode: 400, statusMessage: 'Start and end times must differ' })
    if ((data.breakMinutes ?? 0) >= duration) throw createError({ statusCode: 400, statusMessage: 'Break must be shorter than the shift' })
    const expected = duration - (data.policy.breakPay === 'UNPAID' ? data.breakMinutes ?? 0 : 0)
    if (data.policy.autoClassify && (data.policy.halfDayMinutes > data.policy.fullDayMinutes || data.policy.fullDayMinutes > expected))
        throw createError({ statusCode: 400, statusMessage: 'Half-day minimum must not exceed full-day minimum; full-day minimum must fit paid shift hours' })
    return data
}
export function appendShiftVersion(existing: any, data: any, effectiveFrom: unknown, today = localDateKey(new Date())) {
    if (typeof effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
        !Number.isFinite(Date.parse(effectiveFrom)) || new Date(effectiveFrom).toISOString().slice(0, 10) !== effectiveFrom || effectiveFrom < today)
        throw createError({ statusCode: 400, statusMessage: 'Policy effective date must be today or later' })
    const history = Array.isArray(existing?.policyHistory) && existing.policyHistory.length
        ? [...existing.policyHistory] : [{ effectiveFrom: '0001-01-01', values: shiftSnapshot(existing ?? data) }]
    // A saved effective date is immutable; later changes require a later date.
    if (history.some(v => v.effectiveFrom >= effectiveFrom))
        throw createError({ statusCode: 409, statusMessage: 'Choose an effective date after the latest saved policy version' })
    history.push({ effectiveFrom, values: shiftSnapshot(data) })
    return history
}
