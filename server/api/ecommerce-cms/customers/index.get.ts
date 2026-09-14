import { getQuery } from 'h3'
import { pool } from '~/server/db'
import { isSegment, requireStorefrontStaff, segmentPredicate } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const { companyId } = await requireStorefrontStaff(event)

  const query = getQuery(event)
  const search = String(query.q || '').trim().slice(0, 100)
  const segment = isSegment(query.segment) ? query.segment : 'all'
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(query.page || '1'), 10) || 1))
  const limit = Math.max(5, Math.min(50, Number.parseInt(String(query.limit || '10'), 10) || 10))
  const offset = (page - 1) * limit
  const args = [companyId, search]
  const where = `cc.company_id = $1 AND COALESCE(c.deleted, false) = false
    AND ${segmentPredicate[segment]}
    AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.email ILIKE '%' || $2 || '%'
      OR c.phone ILIKE '%' || $2 || '%')`

  const [count, customers] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM company_clients cc
      JOIN clients c ON c.id = cc.client_id WHERE ${where}`, args),
    pool.query(`SELECT c.id, c.name, c.email, c.phone, cc.status,
        cc.marketing_opt_in_requested_at AS "marketingOptInRequestedAt",
        cc.marketing_opt_in_at AS "marketingOptInAt",
        cc.marketing_opt_in_email AS "marketingOptInEmail",
        COALESCE(orders.order_count, 0)::int AS "orderCount",
        COALESCE(orders.total_spent, 0)::float AS "totalSpent",
        orders.last_order_at AS "lastOrderAt",
        COALESCE(cart.cart_items, 0)::int AS "cartItems",
        COALESCE(wishlist.wishlist_items, 0)::int AS "wishlistItems"
      FROM company_clients cc
      JOIN clients c ON c.id = cc.client_id
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE o.status <> 'CANCELLED') AS order_count,
          sum(o.grand_total) FILTER (WHERE o.status <> 'CANCELLED') AS total_spent,
          max(o.created_at) FILTER (WHERE o.status <> 'CANCELLED') AS last_order_at
        FROM ecomm_orders o WHERE o.company_id = cc.company_id AND o.client_id = c.id
      ) orders ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_array_length(CASE WHEN jsonb_typeof(ec.items::jsonb) = 'array'
          THEN ec.items::jsonb ELSE '[]'::jsonb END) AS cart_items
        FROM ecomm_carts ec WHERE ec.company_id = cc.company_id AND ec.client_id = c.id
      ) cart ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_array_length(CASE WHEN jsonb_typeof(ew.items::jsonb) = 'array'
          THEN ew.items::jsonb ELSE '[]'::jsonb END) AS wishlist_items
        FROM ecomm_wishlists ew WHERE ew.company_id = cc.company_id AND ew.client_id = c.id
      ) wishlist ON true
      WHERE ${where}
      ORDER BY orders.last_order_at DESC NULLS LAST, c.name ASC, c.id ASC
      LIMIT $3 OFFSET $4`, [...args, limit, offset]),
  ])

  return { customers: customers.rows, total: count.rows[0]?.total || 0, page, limit }
})
