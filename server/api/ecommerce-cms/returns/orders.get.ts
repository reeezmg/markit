import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

// Orders a seller can raise a return or exchange against, for the picker in the
// returns/exchange screens.
//
// A request only makes sense once the parcel has actually reached the customer,
// so anything still on its way out is excluded — as is a cancelled order. The
// search covers order number, customer, phone and waybill, because whichever of
// those the seller has in front of them is the one they will type.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { q = '' } = getQuery(event) as { q?: string }
  const term = String(q).trim()

  const { rows } = await pool.query(
    `SELECT o.id,
            o.order_number                        AS "orderNumber",
            o.status,
            o.grand_total                         AS "grandTotal",
            o.items,
            o.created_at                          AS "createdAt",
            COALESCE(o.meta->>'awb', o.meta#>>'{shipping,awb}') AS awb,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', o.shipping_address->>'firstName',
                                         o.shipping_address->>'lastName')), ''),
              c.name)                             AS customer,
            COALESCE(o.shipping_address->>'phoneNo', o.shipping_address->>'phone', c.phone) AS phone,
            o.shipping_address->>'city'           AS city
     FROM ecomm_orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.company_id = $1
       AND o.status IN ('DELIVERED', 'RTO_DELIVERED', 'SHIPPED', 'OUT_FOR_DELIVERY')
       AND ($2 = ''
            OR CAST(o.order_number AS text) ILIKE '%' || $2 || '%'
            OR c.name ILIKE '%' || $2 || '%'
            OR COALESCE(o.shipping_address->>'phoneNo', o.shipping_address->>'phone', c.phone) ILIKE '%' || $2 || '%'
            OR COALESCE(o.meta->>'awb', o.meta#>>'{shipping,awb}') ILIKE '%' || $2 || '%')
     ORDER BY o.created_at DESC
     LIMIT 25`,
    [companyId, term],
  )
  return { orders: rows }
})
