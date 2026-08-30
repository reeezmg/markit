import { defineEventHandler, getQuery, createError } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Raw label data for rendering Markit's own shipping label.
export default defineEventHandler(async (event) => {
  const { waybills } = getQuery(event) as { waybills?: string }
  if (!waybills) throw createError({ statusCode: 400, statusMessage: 'waybills is required' })
  return shippingProxy(event, { method: 'GET', path: 'label-data', query: { waybills } })
})
