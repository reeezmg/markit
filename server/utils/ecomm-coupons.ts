import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

/**
 * Coupon eligibility and redemption for seller-created ecommerce orders.
 *
 * This is a deliberate port of custom-api's `api/app/coupons.py`, kept
 * rule-for-rule identical. A coupon that the storefront would refuse must be
 * refused here too — otherwise the counter becomes a way around the seller's
 * own limits, and the same code behaves differently depending on who typed it.
 * If the rules change there, they change here.
 *
 * Redemption is intentionally split from eligibility: the discount is quoted
 * while the seller is still building the order, but nothing is consumed until
 * the order is actually written.
 */

export interface Coupon {
  id: string
  code: string
  type: string
  discount_value: number | null
  max_discount_amount: number | null
  min_order_value: number | null
  audience_type: string
  is_markit: boolean
}

const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

/** What this coupon takes off an order of `subtotal`. */
export function couponDiscount(coupon: Coupon, subtotal: number): number {
  const value = Number(coupon.discount_value || 0)
  if (coupon.type === 'PERCENTAGE') {
    const raw = (subtotal * value) / 100
    // A percentage coupon can carry a cap; without one it is uncapped.
    return money(coupon.max_discount_amount != null ? Math.min(raw, Number(coupon.max_discount_amount)) : raw)
  }
  if (coupon.type === 'FLAT') return money(Math.min(value, subtotal))
  // GIFT coupons are a different mechanism entirely and are not offered here.
  return 0
}

export function describeCoupon(coupon: Coupon): string {
  if (coupon.type === 'PERCENTAGE') {
    const cap = coupon.max_discount_amount != null ? ` up to ${money(coupon.max_discount_amount)}` : ''
    return `${money(coupon.discount_value)}% off${cap}`
  }
  if (coupon.type === 'FLAT') return `${money(coupon.discount_value)} off`
  return 'Gift coupon'
}

/**
 * Every coupon this customer could use on an order of this size, best first.
 *
 * The WHERE clause is the whole policy in one place: active, in date, of a type
 * we can price, the order big enough, the global usage cap not spent, the
 * customer inside the audience, and their per-client limit not reached.
 */
export async function eligibleCoupons(
  db: PoolClient,
  companyId: string,
  clientId: string | null,
  subtotal: number,
  code?: string | null,
): Promise<Coupon[]> {
  const trimmed = code?.trim().toUpperCase() || null
  const { rows } = await db.query(
    `SELECT c.*
     FROM coupons c
     WHERE (c.company_id = $1 OR c.is_markit = true)
       AND c.is_active = true
       AND c.type IN ('PERCENTAGE', 'FLAT')
       AND c.target_type = 'ALL'
       AND now() BETWEEN c.start_date AND c.end_date
       AND COALESCE(c.min_order_value, 0) <= $2
       AND (c.usage_limit IS NULL OR c.times_used < c.usage_limit)
       AND ($3::text IS NULL OR upper(c.code) = $3::text)
       AND (
         c.audience_type = 'ALL'
         OR (
           $4::text IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM coupon_clients cc
             WHERE cc.coupon_id = c.id
               AND cc.client_id = $4::text
               AND (cc.usage_limit IS NULL OR cc.usage_limit > 0)
           )
         )
       )
       AND (
         c.per_client_limit IS NULL
         OR $4::text IS NULL
         OR (
           SELECT COUNT(*) FROM coupon_usages cu
           WHERE cu.coupon_id = c.id AND cu.client_id = $4::text
         ) < c.per_client_limit
       )
     ORDER BY c.is_markit DESC, c.discount_value DESC, c.end_date ASC
     LIMIT 20`,
    [companyId, subtotal, trimmed, clientId],
  )
  return rows as Coupon[]
}

/** The one eligible coupon with this id, or null if it is not (or no longer) usable. */
export async function findEligibleCoupon(
  db: PoolClient,
  companyId: string,
  clientId: string | null,
  subtotal: number,
  couponId: string,
): Promise<Coupon | null> {
  const rows = await eligibleCoupons(db, companyId, clientId, subtotal)
  return rows.find((row) => row.id === couponId) || null
}

/**
 * Spend the coupon: record the usage against the bill, count it, and take one
 * off the customer's personal allowance.
 *
 * `cancelEcommOrder` is the exact inverse of this — if you change what is
 * consumed here, change what is given back there.
 */
export async function redeemCoupon(
  db: PoolClient,
  coupon: Coupon,
  clientId: string,
  billId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO coupon_usages (id, coupon_id, client_id, bill_id, used_at)
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), coupon.id, clientId, billId],
  )
  await db.query(
    `UPDATE coupons SET times_used = COALESCE(times_used, 0) + 1 WHERE id = $1`,
    [coupon.id],
  )
  if (['GENERATE', 'SPECIFIC'].includes(coupon.audience_type)) {
    // Exactly one row: (coupon_id, client_id) is not unique in coupon_clients,
    // and spending two allowances for one order would be wrong in the same way
    // that refunding two on cancellation would be.
    await db.query(
      `UPDATE coupon_clients SET usage_limit = usage_limit - 1
       WHERE id = (
         SELECT id FROM coupon_clients
         WHERE coupon_id = $1 AND client_id = $2
           AND usage_limit IS NOT NULL AND usage_limit > 0
         ORDER BY "createdAt" ASC
         LIMIT 1
       )`,
      [coupon.id, clientId],
    )
  }
}
