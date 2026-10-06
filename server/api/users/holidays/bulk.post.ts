import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { assertHolidayManager } from '~/server/utils/holiday-settings'
import { defineEventHandler, createError } from 'h3'

export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    assertHolidayManager(session.data.role)
    throw createError({ statusCode: 410, statusMessage: 'Weekly holiday bulk actions have been retired. Configure weekly offs in Shift work days; edit dated holidays individually.' })
})
