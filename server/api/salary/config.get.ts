import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { assertSalaryManager } from '~/server/utils/salary-input'
import { minimumSalaryDate } from '~/server/utils/salary-history'
export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
    const companyId = session.data.companyId, userId = getQuery(event).userId
    if (typeof userId !== 'string' || !userId) throw createError({ statusCode: 400, statusMessage: 'Staff member is required' })
    if (!await prisma.companyUser.findFirst({ where: { companyId, userId, deleted: false } })) throw createError({ statusCode: 404, statusMessage: 'Staff member not found' })
    const config = await prisma.salaryConfig.findUnique({ where: { companyId_userId: { companyId, userId } } })
    const latest = await prisma.payrollCycle.findFirst({ where: { companyId, lines: { some: { userId } } }, orderBy: { periodEnd: 'desc' } })
    return { config, minimumEffectiveFrom: minimumSalaryDate(config, latest?.periodEnd) }
})
