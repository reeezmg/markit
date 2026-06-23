import { defineEventHandler, getQuery } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

export default defineEventHandler(async (event) => {
  const { pincode } = getQuery(event)
  return shippingProxy(event, { method: 'GET', path: 'serviceability', query: { pincode } })
})
