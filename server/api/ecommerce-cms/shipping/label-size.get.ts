import { defineEventHandler } from 'h3'
import { runShippingOperation } from '~/server/utils/shipping'

// Current shipping-label size (A4 | 4R) for the company.
export default defineEventHandler(async (event) =>
  runShippingOperation(event, { method: 'GET', path: 'label-size' }),
)
