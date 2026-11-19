import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

// List pickup requests for the company (most recent first), with the products
// on every attached shipment. A pickup can contain a forward and an exchange
// shipment for the same order, so details stay keyed by the stored
// "<orderId>:<kind>" shipment reference rather than being collapsed by order.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { rows } = await pool.query(
    `SELECT id, location, carrier,
            pickup_date AS "pickupDate", pickup_time AS "pickupTime",
            to_jsonb(ecomm_pickup_requests)->>'requested_pickup_date' AS "requestedPickupDate",
            to_jsonb(ecomm_pickup_requests)->>'requested_pickup_time' AS "requestedPickupTime",
            to_jsonb(ecomm_pickup_requests)->'carrier_schedule' AS "carrierSchedule",
            package_count AS "packageCount", status,
            carrier_pickup_id AS "carrierPickupId",
            order_ids AS "orderIds",
            jsonb_array_length(COALESCE(order_ids, '[]'::jsonb)) AS "orderCount",
            created_at AS "createdAt"
     FROM ecomm_pickup_requests
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [companyId],
  )
  const requests = rows as any[]
  const shipmentRefs = requests.flatMap((request) =>
    Array.isArray(request.orderIds) ? request.orderIds.map(String) : [],
  )
  const orderIds = [...new Set(shipmentRefs.map((reference) => reference.replace(/:(forward|exchange)$/, '')))]

  if (!orderIds.length) return { requests: requests.map((request) => ({ ...request, shipments: [] })) }

  const { rows: orderRows } = await pool.query(
    `SELECT o.id,
            o.order_number AS "orderNumber",
            o.items,
            o.meta,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', o.shipping_address->>'firstName',
                                         o.shipping_address->>'lastName')), ''),
              c.name
            ) AS customer,
            exchange_request.items AS "exchangeItems"
     FROM ecomm_orders o
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN ecomm_order_requests exchange_request
       ON exchange_request.company_id = o.company_id
      AND exchange_request.id = o.meta#>>'{shipping,exchange,requestId}'
     WHERE o.company_id = $1 AND o.id = ANY($2::text[])`,
    [companyId, orderIds],
  )

  const orders = new Map(orderRows.map((order: any) => [order.id, order]))
  const productSnapshot = (items: any, shipmentReference: string) =>
    (Array.isArray(items) ? items : []).map((item: any, index: number) => ({
      id: item.itemId || item.id || `${shipmentReference}:${index}`,
      name: item.name || item.productName || 'Product',
      variantName: item.variantName || item.variant || '',
      size: item.size || '',
      sizeLabel: item.sizeLabel || 'Size',
      barcode: item.barcode || '',
      quantity: Number(item.quantity ?? item.qty ?? 1),
      rate: Number(item.dprice ?? item.sprice ?? item.price ?? item.rate ?? 0),
      value: Number(item.value ?? item.amount ?? 0),
      image: item.image || (Array.isArray(item.images) ? item.images[0] : null) || null,
    }))

  return {
    requests: requests.map((request) => ({
      ...request,
      shipments: (Array.isArray(request.orderIds) ? request.orderIds : []).map((rawReference: unknown) => {
        const reference = String(rawReference)
        const kind = reference.endsWith(':exchange') ? 'exchange' : 'forward'
        const orderId = reference.replace(/:(forward|exchange)$/, '')
        const order: any = orders.get(orderId)
        const items = kind === 'exchange' && Array.isArray(order?.exchangeItems)
          ? order.exchangeItems
          : order?.items

        return {
          id: reference,
          orderId,
          orderNumber: order?.orderNumber ?? null,
          kind,
          awb: kind === 'exchange'
            ? order?.meta?.shipping?.exchange?.awb || null
            : order?.meta?.awb || order?.meta?.shipping?.awb || null,
          customer: order?.customer || null,
          products: productSnapshot(items, reference),
        }
      }),
    })),
  }
})
