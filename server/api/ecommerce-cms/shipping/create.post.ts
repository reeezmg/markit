import { defineEventHandler, readBody } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler(async event => runShippingOperation(event, {
  method: 'POST', path: 'create', body: await readBody(event),
}))
