import { createError } from 'h3'
import type { Prisma } from '@prisma/client'

export function attendanceDay(value: unknown) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw createError({ statusCode: 400, statusMessage: 'A valid attendance date is required' })
    const date = new Date(`${value}T00:00:00`)
    if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(value.slice(0, 4)) || date.getMonth() + 1 !== Number(value.slice(5, 7)) || date.getDate() !== Number(value.slice(8)))
        throw createError({ statusCode: 400, statusMessage: 'Invalid attendance date' })
    return date
}

export function attendanceTimes(date: Date, checkIn: unknown, checkOut: unknown, nextDay = false) {
    const parse = (value: unknown) => {
        if (value === '' || value == null) return null
        if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
            throw createError({ statusCode: 400, statusMessage: 'Times must use HH:mm' })
        const result = new Date(date)
        result.setHours(Number(value.slice(0, 2)), Number(value.slice(3)), 0, 0)
        return result
    }
    const checkInAt = parse(checkIn)
    const checkOutAt = parse(checkOut)
    if (checkOutAt && nextDay) checkOutAt.setDate(checkOutAt.getDate() + 1)
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt)
        throw createError({ statusCode: 400, statusMessage: 'Checkout must follow check-in; select next day for overnight work' })
    return { checkInAt, checkOutAt }
}

/** Keep the same browser-local midnight used by the existing roster queries. */
export function attendanceAnchor(value: unknown, anchor: unknown) {
    attendanceDay(value)
    if (typeof anchor !== 'string' || !anchor.startsWith(`${value}T00:00:00`) || !/^\d{4}-\d{2}-\d{2}T00:00:00[+-](0\d|1[0-4]):[0-5]\d$/.test(anchor))
        throw createError({ statusCode: 400, statusMessage: 'Local attendance midnight is required' })
    const date = new Date(anchor)
    if (!Number.isFinite(date.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid attendance midnight' })
    return date
}

export function localAttendanceTimes(value: string, anchor: string, checkIn: unknown, checkOut: unknown, nextDay = false) {
    // Validate wall-clock ordering independently of the server timezone.
    attendanceTimes(attendanceDay(value), checkIn, checkOut, nextDay)
    const start = attendanceAnchor(value, anchor)
    const parse = (time: unknown, tomorrow = false) => {
        if (!time) return null
        const [hours, minutes] = String(time).split(':').map(Number)
        return new Date(start.getTime() + ((tomorrow ? 1440 : 0) + hours * 60 + minutes) * 60000)
    }
    return { checkInAt: parse(checkIn), checkOutAt: parse(checkOut, nextDay) }
}

export async function attendanceStaff(tx: Prisma.TransactionClient, companyId: string, userId: string) {
    const staff = await tx.companyUser.findFirst({ where: { companyId, userId, deleted: false, status: true } })
    if (!staff) throw createError({ statusCode: 404, statusMessage: 'Active staff member not found in this company' })
}

export async function attendanceShift(tx: Prisma.TransactionClient, companyId: string, userId: string, date: Date, shiftId?: string | null) {
    if (shiftId) {
        const shift = await tx.shift.findFirst({ where: { id: shiftId, companyId, deleted: false } })
        if (!shift) throw createError({ statusCode: 400, statusMessage: 'Shift does not belong to this company' })
        return shift.id
    }
    const end = new Date(date.getTime() + 86400000 - 1)
    const assignment = await tx.shiftAssignment.findFirst({
        where: { companyId, userId, effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }], shift: { deleted: false } },
        orderBy: { effectiveFrom: 'desc' },
    })
    return assignment?.shiftId ?? null
}

/** Replace only the boundary punches: preserve intermediate breaks when correcting a day. */
export async function writeAttendanceTimes(tx: Prisma.TransactionClient, attendance: { id: string; companyId: string; userId: string; checkInAt: Date | null; checkOutAt: Date | null }, note: string | null) {
    const logs = await tx.attendanceLog.findMany({ where: { attendanceId: attendance.id }, orderBy: { punchedAt: 'asc' } })
    const firstIn = logs.find(log => log.type === 'CHECK_IN')
    const lastOut = [...logs].reverse().find(log => log.type === 'CHECK_OUT')
    const middle = logs.filter(log => log.id !== firstIn?.id && log.id !== lastOut?.id)
    if (middle.some(log => !attendance.checkInAt || !attendance.checkOutAt || log.punchedAt <= attendance.checkInAt || log.punchedAt >= attendance.checkOutAt))
        throw createError({ statusCode: 400, statusMessage: 'Selected times conflict with existing break punches' })
    for (const [type, punchedAt, existing] of [
        ['CHECK_IN', attendance.checkInAt, firstIn], ['CHECK_OUT', attendance.checkOutAt, lastOut],
    ] as const) {
        if (!punchedAt) {
            if (existing) await tx.attendanceLog.delete({ where: { id: existing.id } })
        } else if (existing) {
            await tx.attendanceLog.update({ where: { id: existing.id }, data: { punchedAt, source: 'correction', note } })
        } else {
            await tx.attendanceLog.create({ data: { companyId: attendance.companyId, userId: attendance.userId, attendanceId: attendance.id, type, punchedAt, source: 'manual', note } })
        }
    }
}
