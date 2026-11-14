import { defineEventHandler, readBody } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return runShippingOperation(event, { method: 'POST', path: 'ndr', body })
})
