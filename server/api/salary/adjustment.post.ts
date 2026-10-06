import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { assertSalaryManager, salaryMoney } from '~/server/utils/salary-input'
export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
    const companyId = session.data.companyId, body = await readBody(event)
    return prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM companies WHERE id=$1 FOR UPDATE', companyId)
        if (body?.action === 'cancel' || body?.action === 'delete') {
            if (typeof body.id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Adjustment id is required' })
            const row = await tx.payrollAdjustment.findFirst({ where: { id: body.id, companyId } })
            if (!row) throw createError({ statusCode: 404, statusMessage: 'Adjustment not found' })
            if (row.status !== 'PENDING') throw createError({ statusCode: 409, statusMessage: 'Only pending adjustments can be changed' })
            return body.action === 'delete' ? tx.payrollAdjustment.delete({ where: { id: row.id } }) : tx.payrollAdjustment.update({ where: { id: row.id }, data: { status: 'CANCELLED' } })
        }
        if (!body || typeof body.userId !== 'string' || !['ADDITION', 'DEDUCTION'].includes(body.kind) || typeof body.label !== 'string' || !body.label.trim() || body.label.length > 120 || !Number.isInteger(body.month) || body.month < 1 || body.month > 12 || !Number.isInteger(body.year) || body.year < 2000 || body.year > 2100 || (body.reason != null && (typeof body.reason !== 'string' || body.reason.length > 1000))) throw createError({ statusCode: 400, statusMessage: 'Invalid adjustment fields' })
        const amount = salaryMoney(body.amount)
        if (!await tx.companyUser.findFirst({ where: { companyId, userId: body.userId, deleted: false } })) throw createError({ statusCode: 404, statusMessage: 'Staff member not found' })
        return tx.payrollAdjustment.create({ data: { companyId, userId: body.userId, kind: body.kind, label: body.label.trim(), amount, reason: body.reason || null, month: body.month, year: body.year, status: 'PENDING' } })
    }, { isolationLevel: 'Serializable' })
})
