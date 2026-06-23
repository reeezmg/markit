import { defineEventHandler, getRouterParam, createError } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Holiday id is required' })

    await prisma.companyHoliday.deleteMany({ where: { id, companyId } })
    return { ok: true }
})
