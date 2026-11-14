import { defineEventHandler, getQuery, createError } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async (event) => {
  const { uplId } = getQuery(event)
  if (!uplId) throw createError({ statusCode: 400, statusMessage: 'uplId is required' })
  return runShippingOperation(event, { method: 'GET', path: 'ndr-status', query: { uplId } })
})
