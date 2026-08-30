import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

/**
 * Raise a return or exchange request on the customer's behalf.
 *
 * The storefront flow ([custom-api] POST /orders/{id}/requests) is the customer
 * asking; this is the seller recording a request that arrived some other way —
 * a phone call, WhatsApp, a note in the box. It therefore skips the storefront
 * rules (return windows, required photos, auto-approve settings): the seller is
 * the one deciding, and the request is created APPROVED so the reverse pickup
 * or exchange shipment can be created straight away.
 *
 * `meta.source = 'seller'` keeps the two apart, so a request raised here is
 * never mistaken for one the customer submitted.
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{
    orderId?: string
    type?: string
    reason?: string
    items?: any[]
    fee?: number
  }>(event)

  const type = String(body.type || '').toLowerCase()
  if (!body.orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  if (!['return', 'exchange'].includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be return or exchange' })
  }
  const reason = String(body.reason || '').trim()
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'A reason is required' })

  // The order must be this company's — never trust the id from the browser.
  const { rows: orders } = await pool.query(
    `SELECT id, client_id AS "clientId", order_number AS "orderNumber"
     FROM ecomm_orders WHERE id = $1 AND company_id = $2`,
    [body.orderId, companyId],
  )
  const order = orders[0]
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

  // One open request of a type at a time, same as the storefront: two reverse
  // pickups for the same parcel is a real cost, not a duplicate row.
  const { rows: open } = await pool.query(
    `SELECT id, status FROM ecomm_order_requests
     WHERE company_id = $1 AND order_id = $2 AND type = $3
       AND status IN ('PENDING', 'APPROVED')
       AND COALESCE(meta->>'reverseAwb', meta->>'exchangeAwb') IS NULL
     LIMIT 1`,
    [companyId, order.id, type],
  )
  if (open.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Order #${order.orderNumber} already has an open ${type} request (${open[0].status.toLowerCase()}).`,
    })
  }

  const { rows } = await pool.query(
    `INSERT INTO ecomm_order_requests
       (company_id, client_id, order_id, type, status, reason, images, items, fee, meta)
     VALUES ($1, $2, $3, $4, 'APPROVED', $5, '[]'::jsonb, $6::jsonb, $7, $8::jsonb)
     RETURNING id, type, status, created_at AS "createdAt"`,
    [companyId, order.clientId, order.id, type, reason,
     JSON.stringify(Array.isArray(body.items) ? body.items : []),
     Number(body.fee || 0),
     JSON.stringify({ source: 'seller', createdBy: userId || null })],
  )
  return { request: rows[0], orderNumber: order.orderNumber }
})
