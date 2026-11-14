import { defineEventHandler, getRouterParam, createError } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Pickup location id is required' })
  return runShippingOperation(event, { method: 'POST', path: `pickup-locations/${id}/register` })
})
