import { defineEventHandler, readBody, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Row-level shipment creation for a single order (SPS/MPS + label).
export default defineEventHandler(async (event) => {
  const { orderId } = await readBody<{ orderId?: string }>(event)
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  return shippingProxy(event, { method: 'POST', path: `order/${orderId}/create`, body: {} })
})
