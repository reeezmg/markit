import { defineEventHandler, getQuery, createError } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

// Raw label data for rendering Markit's own shipping label.
export default defineEventHandler(async (event) => {
  const { waybills } = getQuery(event) as { waybills?: string }
  if (!waybills) throw createError({ statusCode: 400, statusMessage: 'waybills is required' })
  return runShippingOperation(event, { method: 'GET', path: 'label-data', query: { waybills } })
})
