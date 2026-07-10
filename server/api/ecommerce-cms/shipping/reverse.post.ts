import { defineEventHandler, readBody, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Create a reverse pickup (RVP) shipment for an approved return request.
export default defineEventHandler(async (event) => {
  const { requestId, weight } = await readBody(event)
  if (!requestId) throw createError({ statusCode: 400, statusMessage: 'requestId is required' })
  return shippingProxy(event, { method: 'POST', path: 'reverse', body: { requestId, weight } })
})
