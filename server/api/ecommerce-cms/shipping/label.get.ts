import { createError, defineEventHandler, getQuery } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async event => {
  const { trackingId } = getQuery(event)
  if (typeof trackingId !== 'string' || !trackingId) throw createError({ statusCode: 400, statusMessage: 'trackingId is required' })
  return runShippingOperation(event, { method: 'GET', path: `label/${encodeURIComponent(trackingId)}` })
})
