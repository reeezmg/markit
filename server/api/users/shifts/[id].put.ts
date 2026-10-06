import { defineEventHandler, readBody, getRouterParam, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { validateShiftSettings, appendShiftVersion } from '~/server/utils/shift-settings'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Shift management access required' })
    const body = await readBody(event)
    const data = validateShiftSettings(body)
    return prisma.$transaction(async tx => {
        const existing = await tx.shift.findFirst({ where: { id: getRouterParam(event, 'id'), companyId: session.data.companyId, deleted: false } })
        if (!existing) throw createError({ statusCode: 404, statusMessage: 'Shift not found' })
        const policyHistory = appendShiftVersion(existing, data, body.effectiveFrom)
        const shift = await tx.shift.update({ where: { id: existing.id }, data: { ...data, policyHistory } })
        return { shift }
    }, { isolationLevel: 'Serializable' })
})
