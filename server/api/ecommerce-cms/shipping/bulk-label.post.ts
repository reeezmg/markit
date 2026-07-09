import { defineEventHandler, readBody } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Generate shipping labels in bulk for shipped orders (stores each labelUrl).
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  return shippingProxy(event, { method: 'POST', path: 'bulk-label', body: body || {} })
})
