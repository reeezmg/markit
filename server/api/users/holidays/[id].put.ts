import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { prisma } from '~/server/prisma'
import { assertHolidayManager, validateHoliday } from '~/server/utils/holiday-settings'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    assertHolidayManager(session.data.role)
    const input = validateHoliday(await readBody(event))
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Holiday id is required' })
    try {
        const result = await prisma.companyHoliday.updateMany({ where: { id, companyId }, data: input })
        if (!result.count) throw createError({ statusCode: 404, statusMessage: 'Holiday not found' })
        return { ok: true }
    } catch (error: any) {
        if (error?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: 'This company already has a holiday on that date' })
        throw error
    }
})
