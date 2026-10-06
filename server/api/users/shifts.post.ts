import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { validateShiftSettings, appendShiftVersion } from '~/server/utils/shift-settings'
import { localDateKey } from '~/utils/shift-policy'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Shift management access required' })
    const body = await readBody(event)
    const data = validateShiftSettings(body)
    const policyHistory = appendShiftVersion(null, data, body.effectiveFrom ?? localDateKey(new Date()))
    const shift = await prisma.shift.create({ data: { ...data, companyId: session.data.companyId, policyHistory } })
    return { shift }
})
