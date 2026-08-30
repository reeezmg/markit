import { defineEventHandler, readBody, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Record an e-way bill number against an order (required over ₹50,000) and push
// it to the carrier when the shipment already exists.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ orderId?: string; ewbn?: string; invoiceNumber?: string }>(event)
  if (!body?.orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  if (!body?.ewbn) throw createError({ statusCode: 400, statusMessage: 'E-waybill number is required' })
  return shippingProxy(event, { method: 'POST', path: 'ewaybill', body })
})
