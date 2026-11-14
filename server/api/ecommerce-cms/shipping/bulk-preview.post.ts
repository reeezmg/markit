import { defineEventHandler, readBody } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

// Preview which unshipped orders can get a shipment (resolved weight/dimensions,
// chosen boxes) and which can't. Powers the bulk "Create Shipments" modal.
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  return runShippingOperation(event, { method: 'POST', path: 'bulk-preview', body: body || {} })
})
