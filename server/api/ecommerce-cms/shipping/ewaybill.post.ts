import { defineEventHandler, readBody, createError } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

// Record an e-way bill number against an order (required over ₹50,000) and push
// it to the carrier when the shipment already exists.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ orderId?: string; ewbn?: string; invoiceNumber?: string }>(event)
  if (!body?.orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  if (!body?.ewbn) throw createError({ statusCode: 400, statusMessage: 'E-waybill number is required' })
  return runShippingOperation(event, { method: 'POST', path: 'ewaybill', body })
})
