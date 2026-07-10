import { defineEventHandler, readBody, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Create an exchange (REPL) shipment for an approved exchange request:
// one waybill — replacement out, old item collected and returned.
export default defineEventHandler(async (event) => {
  const { requestId, weight } = await readBody(event)
  if (!requestId) throw createError({ statusCode: 400, statusMessage: 'requestId is required' })
  return shippingProxy(event, { method: 'POST', path: 'exchange', body: { requestId, weight } })
})
