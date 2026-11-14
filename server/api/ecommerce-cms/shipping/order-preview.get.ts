import { defineEventHandler, getQuery, createError } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

// Row-level shipment preview for a single order (resolved dims + chosen boxes).
export default defineEventHandler(async (event) => {
  const { orderId } = getQuery(event) as { orderId?: string }
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  return runShippingOperation(event, { method: 'GET', path: `order/${orderId}/preview` })
})
