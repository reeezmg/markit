import { defineEventHandler, readBody } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Update the shipping-label size (A4 | 4R).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ size?: string }>(event)
  return shippingProxy(event, { method: 'POST', path: 'label-size', body: { size: body?.size } })
})
