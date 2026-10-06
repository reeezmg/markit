import { getQuery, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { defineCompanyListHandler } from '~/server/utils/companyListHandler'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { holidayYear } from '~/server/utils/holiday-settings'
export default defineCompanyListHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    const query = getQuery(event)
    const year = holidayYear(query.year)
    const month = Number(query.month)
    if (!Number.isInteger(month) || month < 1 || month > 12) throw createError({ statusCode: 400, statusMessage: 'Invalid month' })
    const from = new Date(year, month - 1, 1), to = new Date(year, month, 0, 23, 59, 59, 999)
    const [assignments, holidays, leaves] = await Promise.all([
        prisma.shiftAssignment.findMany({ where: { companyId, effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] }, include: { shift: true }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }] }),
        prisma.companyHoliday.findMany({ where: { companyId, date: { gte: from, lte: to } } }),
        prisma.leaveApplication.findMany({ where: { companyId, status: 'APPROVED', startDate: { lte: to }, endDate: { gte: from } }, select: { userId: true, companyId: true, startDate: true, endDate: true, days: true } }),
    ])
    return { assignments, holidays, leaves }
})
