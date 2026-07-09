import { defineEventHandler, getQuery, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Row-level shipment preview for a single order (resolved dims + chosen boxes).
export default defineEventHandler(async (event) => {
  const { orderId } = getQuery(event) as { orderId?: string }
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  return shippingProxy(event, { method: 'GET', path: `order/${orderId}/preview` })
})
