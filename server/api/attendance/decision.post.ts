import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { attendanceShift, writeAttendanceTimes } from '~/server/utils/attendance-write'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Attendance management access required' })
    const body = await readBody(event)
    if (typeof body?.id !== 'string' || !['APPROVED', 'REJECTED'].includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Invalid decision' })
    return prisma.$transaction(async tx => {
        const request = await tx.attendanceAdjustment.findFirst({ where: { id: body.id, companyId } })
        if (!request) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
        if (request.status !== 'PENDING') throw createError({ statusCode: 409, statusMessage: 'This request has already been decided' })
        if (body.status === 'APPROVED') {
            if (!request.requestedCheckInAt && !request.requestedCheckOutAt) throw createError({ statusCode: 400, statusMessage: 'Request must contain a punch time' })
            const existing = await tx.attendance.findFirst({ where: { companyId, userId: request.userId,
                date: { gte: request.date, lt: new Date(request.date.getTime() + 86400000) },
            } })
            const where = { companyId_userId_date: { companyId, userId: request.userId, date: existing?.date ?? request.date } }
            const checkInAt = request.requestedCheckInAt ?? existing?.checkInAt ?? null
            const checkOutAt = request.requestedCheckOutAt ?? existing?.checkOutAt ?? null
            if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw createError({ statusCode: 400, statusMessage: 'Checkout must follow check-in' })
            const shiftId = existing?.shiftId ?? await attendanceShift(tx, companyId, request.userId, request.date, request.shiftId)
            const attendance = await tx.attendance.upsert({ where,
                create: { companyId, userId: request.userId, date: request.date, status: 'PRESENT', checkInAt, checkOutAt, shiftId },
                update: { checkInAt, checkOutAt, shiftId, status: 'PRESENT' },
            })
            await writeAttendanceTimes(tx, attendance, `Adjustment ${request.id}: ${request.reason}`)
        }
        return tx.attendanceAdjustment.update({ where: { id: request.id }, data: {
            status: body.status, decidedByUserId: session.data.id,
            decisionNote: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null,
        } })
    }, { isolationLevel: 'Serializable' })
})
