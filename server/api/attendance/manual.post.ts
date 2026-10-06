import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { attendanceAnchor, localAttendanceTimes, attendanceStaff, attendanceShift, writeAttendanceTimes } from '~/server/utils/attendance-write'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Attendance management access required' })
    const body = await readBody(event)
    if (typeof body?.userId !== 'string' || !body.userId) throw createError({ statusCode: 400, statusMessage: 'Staff member is required' })
    if (!['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY'].includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Invalid attendance status' })
    const date = attendanceAnchor(body.date, body.dayAnchor)
    const times = localAttendanceTimes(body.date, body.dayAnchor, body.checkIn, body.checkOut, body.nextDay === true)
    if (['PRESENT', 'HALF_DAY'].includes(body.status) && !times.checkInAt) throw createError({ statusCode: 400, statusMessage: 'Check-in is required for present attendance' })
    if (['ABSENT', 'LEAVE', 'HOLIDAY'].includes(body.status) && (times.checkInAt || times.checkOutAt)) throw createError({ statusCode: 400, statusMessage: 'Remove punch times for this status' })
    return prisma.$transaction(async tx => {
        await attendanceStaff(tx, companyId, body.userId)
        const shiftId = await attendanceShift(tx, companyId, body.userId, date, body.shiftId)
        const existing = await tx.attendance.findFirst({ where: { companyId, userId: body.userId, date: { gte: date, lt: new Date(date.getTime() + 86400000) } } })
        if (body.id ? existing?.id !== body.id : Boolean(existing)) throw createError({ statusCode: 409, statusMessage: 'Attendance changed or already exists; refresh and edit the entry' })
        const data = { ...times, shiftId, status: body.status }
        const attendance = existing
            ? await tx.attendance.update({ where: { id: existing.id }, data })
            : await tx.attendance.create({ data: { ...data, companyId, userId: body.userId, date } })
        await writeAttendanceTimes(tx, attendance, typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null)
        return attendance
    }, { isolationLevel: 'Serializable' })
})
