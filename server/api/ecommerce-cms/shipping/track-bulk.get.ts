import { defineEventHandler, getQuery, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Live carrier status for many waybills in one call (up to 50, comma-separated).
// Powers the orders table so its status column reflects Delhivery, not a
// locally-set value.
export default defineEventHandler(async (event) => {
  const { waybills, provider_hint } = getQuery(event)
  if (!waybills) throw createError({ statusCode: 400, statusMessage: 'waybills is required' })
  return shippingProxy(event, {
    method: 'GET',
    path: 'track-bulk',
    query: provider_hint ? { waybills, provider_hint } : { waybills },
  })
})
