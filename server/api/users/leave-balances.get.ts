import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { buildShiftCalendar } from '~/server/utils/shift-calendar'
import { localDateKey } from '~/utils/shift-policy'
import { attendanceDay } from '~/server/utils/attendance-write'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    const query = getQuery(event)
    const userId = typeof query.userId === 'string' ? query.userId : session.data.id
    if (userId !== session.data.id && !['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Staff management access required' })
    const to = attendanceDay(query.date || localDateKey(new Date()))
    const inclusiveEnd = new Date(+to + 86400000 - 1)
    const [assignments, attendances, leaves, holidays] = await Promise.all([
        prisma.shiftAssignment.findMany({ where: { companyId, userId, effectiveFrom: { lte: inclusiveEnd } }, include: { shift: true } }),
        prisma.attendance.findMany({ where: { companyId, userId, date: { lte: inclusiveEnd } }, include: { shift: true, logs: true } }),
        prisma.leaveApplication.findMany({ where: { companyId, userId, status: 'APPROVED', startDate: { lte: inclusiveEnd } } }),
        prisma.companyHoliday.findMany({ where: { companyId, date: { lte: inclusiveEnd } } }),
    ])
    const result = buildShiftCalendar({ assignments, attendances, leaves, holidays: new Set(holidays.map(h => localDateKey(h.date))), from: to, to })
    return { balances: result.balances, compOffBalance: result.compOffBalance, typedLeaveEnabled: result.typedLeaveEnabled }
})
