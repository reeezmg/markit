import { defineEventHandler, getQuery } from 'h3'
import { shippingProxy } from '~/server/utils/shipping-proxy'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  return shippingProxy(event, {
    method: 'GET',
    path: 'rates',
    query: {
      pickup_pincode: q.pickup_pincode,
      delivery_pincode: q.delivery_pincode,
      weight: q.weight,
      cod_amount: q.cod_amount,
    },
  })
})
