import { defineEventHandler, getQuery, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

export default defineEventHandler(async (event) => {
  const { uplId } = getQuery(event)
  if (!uplId) throw createError({ statusCode: 400, statusMessage: 'uplId is required' })
  return shippingProxy(event, { method: 'GET', path: 'ndr-status', query: { uplId } })
})
