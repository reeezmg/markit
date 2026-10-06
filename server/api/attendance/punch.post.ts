import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { attendanceAnchor, attendanceStaff, attendanceShift } from '~/server/utils/attendance-write'
import { openOvernightAttendance, overnightAttendanceWindow } from '~/utils/overnight-attendance'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const { companyId, id: actor, role } = session.data
    const body = await readBody(event)
    if (!body || !['CHECK_IN', 'CHECK_OUT'].includes(body.type) || typeof body.userId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Staff and punch type are required' })
    if (body.userId !== actor && !['admin', 'manager', 'accountant'].includes(role)) throw createError({ statusCode: 403, statusMessage: 'You may only mark your own attendance' })
    const date = attendanceAnchor(body.date, body.dayAnchor)
    const now = new Date()
    // The client sends its local midnight, as existing attendance dates do.
    const anchor = new Date(body.dayAnchor)
    if (!Number.isFinite(anchor.getTime()) || anchor > now || now.getTime() - anchor.getTime() >= 86400000 || !String(body.dayAnchor).startsWith(body.date)) throw createError({ statusCode: 400, statusMessage: 'Live punches are only available for today' })
    return prisma.$transaction(async tx => {
        await attendanceStaff(tx, companyId, body.userId)
        let existing = await tx.attendance.findFirst({ where: { companyId, userId: body.userId, date: { gte: date, lt: new Date(date.getTime() + 86400000) } }, include: { logs: { orderBy: { punchedAt: 'desc' } }, shift: true } })
        const previous = await tx.attendance.findFirst({ where: { companyId, userId: body.userId, date: { gte: new Date(+date - 86400000), lt: date } }, include: { logs: { orderBy: { punchedAt: 'desc' } }, shift: true }, orderBy: { date: 'desc' } })
        const overnight = openOvernightAttendance(previous, date, body.date, now)
        if (body.type === 'CHECK_IN' && overnight) throw createError({ statusCode: 409, statusMessage: 'Check out of the previous night shift first' })
        if (body.type === 'CHECK_IN' && !existing && overnightAttendanceWindow(previous, date, body.date, now)) existing = previous
        if (body.type === 'CHECK_OUT' && overnight && existing?.logs[0]?.type !== 'CHECK_IN') existing = previous
        const where = { companyId_userId_date: { companyId, userId: body.userId, date: existing?.date ?? date } }
        const last = existing?.logs[0]?.type ?? (existing?.checkInAt && !existing.checkOutAt ? 'CHECK_IN' : undefined)
        if (body.type === last || (body.type === 'CHECK_OUT' && last !== 'CHECK_IN')) throw createError({ statusCode: 409, statusMessage: 'Punch sequence changed; refresh attendance' })
        const shiftId = existing?.shiftId ?? await attendanceShift(tx, companyId, body.userId, date)
        const attendance = await tx.attendance.upsert({ where,
            create: { companyId, userId: body.userId, date, shiftId, status: 'PRESENT', checkInAt: now },
            update: { status: 'PRESENT', ...(body.type === 'CHECK_IN' ? { checkInAt: existing?.checkInAt ?? now, checkOutAt: null } : { checkOutAt: now }) },
        })
        await tx.attendanceLog.create({ data: { companyId, userId: body.userId, attendanceId: attendance.id, type: body.type, punchedAt: now, source: 'live' } })
        return attendance
    }, { isolationLevel: 'Serializable' })
})
