import { defineEventHandler, readBody } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return shippingProxy(event, { method: 'POST', path: 'ndr', body })
})
