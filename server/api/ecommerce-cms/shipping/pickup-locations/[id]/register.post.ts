import { defineEventHandler, getRouterParam, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Pickup location id is required' })
  return shippingProxy(event, { method: 'POST', path: `pickup-locations/${id}/register` })
})
