import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Attendance management access required' })
    const body = await readBody(event)
    if (typeof body?.id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Attendance ID is required' })
    const result = await prisma.attendance.deleteMany({ where: { id: body.id, companyId: session.data.companyId } })
    if (!result.count) throw createError({ statusCode: 404, statusMessage: 'Attendance not found' })
    return { deleted: true }
})
