import { defineEventHandler, readBody } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Create shipments in bulk for all unshipped orders (cartonization + MPS for
// multi-box orders). Returns per-order results.
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  return shippingProxy(event, { method: 'POST', path: 'bulk-create', body: body || {} })
})
