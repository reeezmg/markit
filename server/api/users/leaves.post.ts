import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { prisma } from '~/server/prisma'
import { validateLeave } from '~/server/utils/leave-settings'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Leave management access required' })
    const input = validateLeave(await readBody(event))
    const id = false ? getRouterParam(event, 'id') : undefined
    return prisma.$transaction(async tx => {
        if (false && !await tx.leaveApplication.findFirst({ where: { id, companyId } })) throw createError({ statusCode: 404, statusMessage: 'Leave application not found' })
        if (!await tx.companyUser.findFirst({ where: { companyId, userId: input.userId, status: true, deleted: false } })) throw createError({ statusCode: 404, statusMessage: 'Active staff member not found' })
        if (['PENDING', 'APPROVED'].includes(input.status) && await tx.leaveApplication.findFirst({ where: {
            companyId, userId: input.userId, ...(id ? { id: { not: id } } : {}), status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: input.endDate }, endDate: { gte: input.startDate },
        } })) throw createError({ statusCode: 409, statusMessage: 'This staff member already has an overlapping leave application' })
        const data = { ...input, companyId, decidedByUserId: input.status === 'PENDING' ? null : session.data.id }
        const leave = false ? await tx.leaveApplication.update({ where: { id }, data }) : await tx.leaveApplication.create({ data })
        return { leave }
    }, { isolationLevel: 'Serializable' })
})
