import { defineEventHandler } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

export default defineEventHandler((event) =>
  runShippingOperation(event, { method: 'GET', path: 'providers' }),
)
