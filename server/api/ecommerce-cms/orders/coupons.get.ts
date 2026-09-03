import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { couponDiscount, describeCoupon, eligibleCoupons } from '~/server/utils/ecomm-coupons'

/**
 * Coupons this customer could use on an order of this size.
 *
 * A quote, not a reservation — nothing is consumed here, and the coupon is
 * validated again against the server's own subtotal when the order is actually
 * created. So a coupon shown as eligible can still be refused at creation if
 * the basket changed underneath it, which is the correct order of authority.
 *
 * Pass `code` to check one specific code (what the seller types in), or leave
 * it off to list everything available (what the seller browses).
 *
 * GET /api/ecommerce-cms/orders/coupons?clientId=…&subtotal=1200&code=DIWALI
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const clientId = String(query.clientId || '').trim() || null
  const subtotal = Math.max(0, Number(query.subtotal || 0))
  const code = String(query.code || '').trim() || null

  const client = await pool.connect()
  try {
    const rows = await eligibleCoupons(client, companyId, clientId, subtotal, code)
    return {
      coupons: rows.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        description: describeCoupon(coupon),
        minOrderValue: coupon.min_order_value,
        discount: couponDiscount(coupon, subtotal),
      })),
    }
  } finally {
    client.release()
  }
})
