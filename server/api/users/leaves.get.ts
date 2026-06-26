import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '~/server/prisma'

const parseDate = (value: unknown, fallback: Date) => {
    if (!value) return fallback
    const d = new Date(String(value))
    return isNaN(d.getTime()) ? fallback : d
}

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const query = getQuery(event)
    const now = new Date()
    const from = parseDate(query.from, new Date(now.getFullYear(), 0, 1))
    const to = parseDate(query.to, new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999))
    const status = typeof query.status === 'string' && query.status !== 'ALL' ? query.status : undefined
    const userId = typeof query.userId === 'string' && query.userId ? query.userId : undefined

    const leaves = await prisma.leaveApplication.findMany({
        where: {
            companyId,
            ...(userId && { userId }),
            ...(status && { status: status as any }),
            startDate: { lte: to },
            endDate: { gte: from },
        },
        include: { user: { select: { userId: true, code: true, name: true, phone: true, user: { select: { email: true } } } } },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })

    return { leaves }
})
