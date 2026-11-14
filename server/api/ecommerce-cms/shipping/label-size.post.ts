import { defineEventHandler, readBody } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

// Update the shipping-label size (A4 | 4R).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ size?: string }>(event)
  return runShippingOperation(event, { method: 'POST', path: 'label-size', body: { size: body?.size } })
})
