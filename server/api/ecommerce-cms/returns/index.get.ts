import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

// Return / exchange requests from storefront customers, joined with their
// order (forward + reverse shipping meta) so the returns page can approve,
// create the reverse pickup, and track it.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { rows } = await pool.query(
    `SELECT r.id, r.type, r.status, r.reason, r.items, r.fee, r.meta,
            r.created_at AS "createdAt",
            o.id AS "orderId", o.order_number AS "orderNumber", o.status AS "orderStatus",
            o.shipping_address AS "shippingAddress", o.grand_total AS "grandTotal",
            o.meta->'shipping' AS shipping
     FROM ecomm_order_requests r
     JOIN ecomm_orders o ON o.id = r.order_id AND o.company_id = r.company_id
     WHERE r.company_id = $1 AND r.type IN ('return', 'exchange')
     ORDER BY r.created_at DESC
     LIMIT 100`,
    [companyId],
  )
  return { requests: rows }
})
