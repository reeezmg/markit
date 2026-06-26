import { defineEventHandler, readBody, getRouterParam, createError } from 'h3'
import { prisma } from '~/server/prisma'

const overtimeModes = new Set(['NONE', 'HOURLY', 'DAILY'])
const periods = new Set(['WEEKLY', 'MONTHLY', 'YEARLY'])
const defaultWorkDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const validWorkDays = new Set(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'])

const numberValue = (value: unknown) => Number(value) || 0
const periodValue = (value: unknown, fallback = 'MONTHLY') => {
    const period = String(value || fallback)
    return periods.has(period) ? period : fallback
}
const workDaysValue = (value: unknown) => {
    const days = Array.isArray(value) ? value.filter((day) => validWorkDays.has(String(day))).map(String) : []
    return days.length ? days : defaultWorkDays
}

const shiftDataFromBody = (body: any) => {
    const name = body.name?.trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Shift name is required' })
    if (!body.startTime || !body.endTime) throw createError({ statusCode: 400, statusMessage: 'Start and end time are required' })
    const overtimeMode = String(body.overtimeMode || 'NONE')
    return {
        name,
        startTime: body.startTime,
        endTime: body.endTime,
        workDays: workDaysValue(body.workDays),
        breakMinutes: body.breakMinutes === null || body.breakMinutes === undefined || body.breakMinutes === '' ? null : numberValue(body.breakMinutes),
        overtimeMode: (overtimeModes.has(overtimeMode) ? overtimeMode : 'NONE') as any,
        overtimeRate: numberValue(body.overtimeRate),
        otDailyThresholdMinutes: numberValue(body.otDailyThresholdMinutes),
        otHourlyRoundMinutes: numberValue(body.otHourlyRoundMinutes),
        leaveCutFullDay: numberValue(body.leaveCutFullDay),
        leaveCutHalfDay: numberValue(body.leaveCutHalfDay),
        leaveCutPerHour: numberValue(body.leaveCutPerHour),
        paidLeaveDays: numberValue(body.paidLeaveDays),
        casualLeaveDays: numberValue(body.casualLeaveDays),
        casualLeavePeriod: periodValue(body.casualLeavePeriod) as any,
        sickLeaveDays: numberValue(body.sickLeaveDays),
        sickLeavePeriod: periodValue(body.sickLeavePeriod) as any,
        earnedLeaveDays: numberValue(body.earnedLeaveDays),
        earnedLeavePeriod: periodValue(body.earnedLeavePeriod, 'YEARLY') as any,
        otherLeaveDays: numberValue(body.otherLeaveDays),
        otherLeavePeriod: periodValue(body.otherLeavePeriod) as any,
        holidayPaid: Boolean(body.holidayPaid),
        lateEntryGraceMinutes: numberValue(body.lateEntryGraceMinutes),
        lateEntryFine: numberValue(body.lateEntryFine),
        earlyExitGraceMinutes: numberValue(body.earlyExitGraceMinutes),
        earlyExitFine: numberValue(body.earlyExitFine),
    }
}

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Shift id is required' })

    const body = await readBody<any>(event)
    const existing = await prisma.shift.findFirst({ where: { id, companyId }, select: { id: true } })
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Shift not found' })

    const shift = await prisma.shift.update({ where: { id }, data: shiftDataFromBody(body) })
    return { shift }
})
