import { holidayYear } from '~/server/utils/holiday-settings'
import { defineCompanyListHandler } from '~/server/utils/companyListHandler';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '~/server/prisma'

export default defineCompanyListHandler(async (event) => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const query = getQuery(event)
    const year = holidayYear(query.year ?? new Date().getFullYear())
    if (!year) throw createError({ statusCode: 400, statusMessage: 'Invalid year' })

    const start = new Date(year, 0, 1)
    const end = new Date(year + 1, 0, 1)
    const holidays = await prisma.companyHoliday.findMany({
        where: { companyId, date: { gte: start, lt: end } },
        orderBy: { date: 'asc' },
    })

    return { holidays }
})
