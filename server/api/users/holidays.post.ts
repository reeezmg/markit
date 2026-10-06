import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { assertHolidayManager, validateHoliday } from '~/server/utils/holiday-settings'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const companyId = session.data.companyId
    assertHolidayManager(session.data.role)
    const input = validateHoliday(await readBody(event))
    try {
        const holiday = await prisma.companyHoliday.create({ data: { ...input, companyId } })
        return { holiday }
    } catch (error: any) {
        if (error?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: 'This company already has a holiday on that date. Open it to edit.' })
        throw error
    }
})
