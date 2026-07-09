import { defineEventHandler } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Current shipping-label size (A4 | 4R) for the company.
export default defineEventHandler(async (event) =>
  shippingProxy(event, { method: 'GET', path: 'label-size' }),
)
