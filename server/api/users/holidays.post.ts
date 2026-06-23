import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'

const dayFromKey = (value: string) => {
    const d = new Date(`${value}T00:00:00`)
    if (isNaN(d.getTime())) return null
    return d
}

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<{ date?: string; name?: string | null }>(event)
    const date = body?.date ? dayFromKey(body.date) : null
    if (!date) throw createError({ statusCode: 400, statusMessage: 'Holiday date is required' })

    const holiday = await prisma.companyHoliday.upsert({
        where: { companyId_date: { companyId, date } },
        create: { companyId, date, name: body.name?.trim() || null },
        update: { name: body.name?.trim() || null },
    })

    return { holiday }
})
