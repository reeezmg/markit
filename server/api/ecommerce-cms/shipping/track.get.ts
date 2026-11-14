import { defineEventHandler, getQuery, createError } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async (event) => {
  const { trackingId, provider_hint } = getQuery(event)
  if (!trackingId) throw createError({ statusCode: 400, statusMessage: 'trackingId is required' })
  return runShippingOperation(event, {
    method: 'GET',
    path: `track/${trackingId}`,
    query: provider_hint ? { provider_hint } : undefined,
  })
})
