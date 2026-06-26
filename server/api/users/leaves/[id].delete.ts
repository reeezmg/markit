import { defineEventHandler, getRouterParam, createError } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Leave id is required' })

    const existing = await prisma.leaveApplication.findFirst({ where: { id, companyId }, select: { id: true } })
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Leave application not found' })

    await prisma.leaveApplication.delete({ where: { id } })
    return { ok: true }
})
