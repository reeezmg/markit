import { defineEventHandler, getQuery } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async (event) => {
  const { pincode } = getQuery(event)
  return runShippingOperation(event, { method: 'GET', path: 'serviceability', query: { pincode } })
})
