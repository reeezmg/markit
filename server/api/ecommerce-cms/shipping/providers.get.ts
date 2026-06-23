import { defineEventHandler } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

export default defineEventHandler((event) =>
  shippingProxy(event, { method: 'GET', path: 'providers' }),
)
