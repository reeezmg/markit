import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { assertSalaryManager } from '~/server/utils/salary-input'
import { appendSalaryRate, minimumSalaryDate } from '~/server/utils/salary-history'
export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
    const companyId = session.data.companyId, body = await readBody(event)
    if (typeof body?.userId !== 'string' || !body.userId) throw createError({ statusCode: 400, statusMessage: 'Staff member is required' })
    return prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM companies WHERE id=$1 FOR UPDATE', companyId)
        const userId = body.userId
        if (!await tx.companyUser.findFirst({ where: { companyId, userId, deleted: false } })) throw createError({ statusCode: 404, statusMessage: 'Staff member not found' })
        const existing = await tx.salaryConfig.findUnique({ where: { companyId_userId: { companyId, userId } } })
        const latest = await tx.payrollCycle.findFirst({ where: { companyId, lines: { some: { userId } } }, orderBy: { periodEnd: 'desc' } })
        const data = appendSalaryRate(existing, body, minimumSalaryDate(existing, latest?.periodEnd))
        return tx.salaryConfig.upsert({ where: { companyId_userId: { companyId, userId } }, create: { ...data, companyId, userId }, update: data })
    }, { isolationLevel: 'Serializable' })
})
