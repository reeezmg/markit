import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'

const MS_DAY = 86400000

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<{ year?: number; weekday?: number; clearWeekends?: boolean }>(event)
    const year = Number(body?.year)
    if (!year) throw createError({ statusCode: 400, statusMessage: 'Invalid year' })

    const yearStart = new Date(year, 0, 1)
    const yearEndExclusive = new Date(year + 1, 0, 1)

    if (body.clearWeekends) {
        const weekendDates: Date[] = []
        for (let t = yearStart.getTime(); t < yearEndExclusive.getTime(); t += MS_DAY) {
            const d = new Date(t)
            if (d.getDay() === 0 || d.getDay() === 6) weekendDates.push(d)
        }
        const result = await prisma.companyHoliday.deleteMany({
            where: { companyId, date: { in: weekendDates } },
        })
        return { count: result.count }
    }

    const weekday = Number(body?.weekday)
    if (weekday < 0 || weekday > 6) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid weekday' })
    }

    const rows: { companyId: string; date: Date; name: string }[] = []
    for (let t = yearStart.getTime(); t < yearEndExclusive.getTime(); t += MS_DAY) {
        const d = new Date(t)
        if (d.getDay() === weekday) rows.push({ companyId, date: d, name: 'Weekly holiday' })
    }

    const result = await prisma.companyHoliday.createMany({
        data: rows,
        skipDuplicates: true,
    })

    return { count: result.count }
})
