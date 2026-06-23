import { defineEventHandler, readBody, createError } from 'h3'
import { recordPayment, type PayInput } from './_payment'

/**
 * Pay a single user (financial). See _payment.ts for the write logic.
 */
export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<PayInput>(event)
    try {
        const res = await recordPayment(companyId, body)
        return { success: true, ...res }
    } catch (err: any) {
        if (err?.statusCode) throw err
        throw createError({ statusCode: 500, statusMessage: `Could not record payment: ${err.message}` })
    }
})
