import { createError } from 'h3'
import { attendanceAnchor, localAttendanceTimes, attendanceStaff } from './attendance-write'

export const attendanceManager = (role: string) => ['admin', 'manager', 'accountant'].includes(role)
export function assertAttendanceManager(role: string) {
    if (!attendanceManager(role)) throw createError({ statusCode: 403, statusMessage: 'Attendance management access required' })
}
export async function saveAttendanceRequest(tx: any, session: any, body: any) {
    const companyId = session.companyId
    if (!body || typeof body.userId !== 'string' || !body.userId || (body.id != null && typeof body.id !== 'string')) throw createError({ statusCode: 400, statusMessage: 'Staff member is required' })
    if (!attendanceManager(session.role) && body.userId !== session.id) throw createError({ statusCode: 403, statusMessage: 'You can request corrections only for yourself' })
    const existing = body.id ? await tx.attendanceAdjustment.findFirst({ where: { id: body.id, companyId } }) : null
    if (body.id && !existing) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    if (existing && (existing.status !== 'PENDING' || existing.userId !== body.userId)) throw createError({ statusCode: 409, statusMessage: 'Only pending requests can be edited; staff cannot be changed' })
    await attendanceStaff(tx, companyId, body.userId)
    const date = attendanceAnchor(body.date, body.dateAnchor)
    if (body.nextDay != null && typeof body.nextDay !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Invalid next-day checkout option' })
    const times = localAttendanceTimes(body.date, body.dateAnchor, body.checkIn, body.checkOut, body.nextDay === true)
    if (!times.checkInAt && !times.checkOutAt) throw createError({ statusCode: 400, statusMessage: 'Enter a check-in or checkout time' })
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000) throw createError({ statusCode: 400, statusMessage: 'Reason must contain 1 to 1000 characters' })
    const data = { date, requestedCheckInAt: times.checkInAt, requestedCheckOutAt: times.checkOutAt, reason: body.reason.trim() }
    if (existing) return tx.attendanceAdjustment.update({ where: { id: existing.id }, data })
    return tx.attendanceAdjustment.create({ data: { ...data, companyId, userId: body.userId, status: 'PENDING' } })
}
export async function cancelAttendanceRequest(tx: any, session: any, id: unknown) {
    if (typeof id !== 'string' || !id) throw createError({ statusCode: 400, statusMessage: 'Request id is required' })
    const request = await tx.attendanceAdjustment.findFirst({ where: { id, companyId: session.companyId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    if (!attendanceManager(session.role) && request.userId !== session.id) throw createError({ statusCode: 403, statusMessage: 'You can cancel only your own requests' })
    if (request.status !== 'PENDING') throw createError({ statusCode: 409, statusMessage: 'Only pending requests can be cancelled' })
    return tx.attendanceAdjustment.update({ where: { id }, data: { status: 'CANCELLED' } })
}
