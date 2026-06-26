import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'

const leaveTypes = new Set(['CASUAL', 'SICK', 'EARNED', 'OTHER'])
const statuses = new Set(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
const dayFromKey = (value?: string) => {
    if (!value) return null
    const d = new Date(`${value}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
}
const inclusiveDays = (start: Date, end: Date) => Math.floor((end.getTime() - start.getTime()) / 86400000) + 1

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<{
        userId?: string
        type?: string
        customType?: string | null
        startDate?: string
        endDate?: string
        days?: number
        reason?: string
        status?: string
        decisionNote?: string | null
    }>(event)

    const userId = body.userId?.trim()
    const type = body.type?.trim()
    const startDate = dayFromKey(body.startDate)
    const endDate = dayFromKey(body.endDate)
    const reason = body.reason?.trim()
    const status = body.status && statuses.has(body.status) ? body.status : 'APPROVED'

    if (!userId) throw createError({ statusCode: 400, statusMessage: 'Employee is required' })
    if (!type || !leaveTypes.has(type)) throw createError({ statusCode: 400, statusMessage: 'Leave type is required' })
    if (!startDate || !endDate || endDate < startDate) throw createError({ statusCode: 400, statusMessage: 'Valid start and end dates are required' })
    if (!reason) throw createError({ statusCode: 400, statusMessage: 'Reason is required' })

    const user = await prisma.companyUser.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { userId: true } })
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Employee not found' })

    const days = Number(body.days ?? inclusiveDays(startDate, endDate))
    if (!Number.isFinite(days) || days <= 0) throw createError({ statusCode: 400, statusMessage: 'Leave days must be greater than 0' })

    const leave = await prisma.leaveApplication.create({
        data: {
            companyId,
            userId,
            type: type as any,
            customType: type === 'OTHER' ? body.customType?.trim() || null : null,
            startDate,
            endDate,
            days,
            reason,
            status: status as any,
            decisionNote: body.decisionNote?.trim() || null,
            decidedByUserId: status === 'PENDING' ? null : (session.data?.id as string | undefined) ?? null,
        },
    })

    return { leave }
})
