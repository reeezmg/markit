/**
 * What a warehouse pickup would actually collect.
 *
 * A pickup is a request for the courier to come to YOUR warehouse, so the unit
 * is a shipment leaving it — not an order. One order can contribute two:
 *
 *   forward   the original parcel (meta.awb), while it is manifested but not
 *             yet collected
 *   exchange  the REPL replacement (meta.shipping.exchange.awb), which also
 *             leaves the warehouse and needs collecting
 *
 * A return (RVP) is deliberately absent: it is collected from the customer's
 * door, not from you, so counting it here would inflate the package count you
 * promise the carrier.
 *
 * Keying on the shipment is what makes the exchange leg visible at all. Keyed on
 * the order, as this used to be, an exchange could never qualify: its waybill is
 * not meta.awb, and its order is DELIVERED by the time the exchange exists.
 */

/** One row per collectable shipment, shared by the count, list and raise routes. */
export const PICKUP_SHIPMENTS_SQL = `
  SELECT o.id                                          AS "orderId",
         o.id || ':forward'                            AS id,
         'forward'                                     AS kind,
         o.meta->>'awb'                                AS awb,
         o.order_number                                AS "orderNumber",
         o.status,
         o.grand_total                                 AS "grandTotal",
         o.created_at                                  AS "createdAt",
         o.meta->'shipping'->>'boxCount'               AS "boxCount",
         o.meta->'shipping'->>'totalWeight'            AS "totalWeight",
         COALESCE((o.meta->'shipping'->>'pickupExcluded')::boolean, false) AS excluded,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', o.shipping_address->>'firstName',
                                      o.shipping_address->>'lastName')), ''),
           c.name)                                     AS customer,
         o.shipping_address->>'city'                   AS city,
         o.shipping_address->>'pincode'                AS pincode
  FROM ecomm_orders o
  LEFT JOIN clients c ON c.id = o.client_id
  WHERE o.company_id = $1
    AND (o.meta->>'awb') IS NOT NULL
    -- Awaiting pickup: the carrier has a waybill but has not collected it yet.
    -- PACKED covers rows written before statuses were synced from tracking.
    AND o.status IN ('MANIFESTED', 'NOT_PICKED', 'PACKED')
    AND o.meta->'shipping'->>'provider' = $2
    AND (o.meta->'shipping'->>'location' = $3 OR o.meta->'shipping'->>'location' IS NULL)
    AND (o.meta->'shipping'->>'pickupRequestId') IS NULL

  UNION ALL

  SELECT o.id                                          AS "orderId",
         o.id || ':exchange'                           AS id,
         'exchange'                                    AS kind,
         o.meta#>>'{shipping,exchange,awb}'            AS awb,
         o.order_number                                AS "orderNumber",
         o.status,
         o.grand_total                                 AS "grandTotal",
         o.created_at                                  AS "createdAt",
         NULL                                          AS "boxCount",
         o.meta->'shipping'->>'totalWeight'            AS "totalWeight",
         COALESCE((o.meta#>>'{shipping,exchange,pickupExcluded}')::boolean, false) AS excluded,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', o.shipping_address->>'firstName',
                                      o.shipping_address->>'lastName')), ''),
           c.name)                                     AS customer,
         o.shipping_address->>'city'                   AS city,
         o.shipping_address->>'pincode'                AS pincode
  FROM ecomm_orders o
  LEFT JOIN clients c ON c.id = o.client_id
  WHERE o.company_id = $1
    AND (o.meta#>>'{shipping,exchange,awb}') IS NOT NULL
    -- The REPL waybill covers the whole journey, so there is no order status to
    -- read it from; the pickup tag on the exchange leg is what marks it done.
    AND (o.meta#>>'{shipping,exchange,pickupRequestId}') IS NULL
    AND COALESCE(o.meta->'shipping'->>'provider', $2) = $2
    AND (o.meta->'shipping'->>'location' = $3 OR o.meta->'shipping'->>'location' IS NULL)
`

/** Where the pickup request id is written once the carrier accepts it. */
export const pickupTagPath = (kind: string) =>
  kind === 'exchange' ? '{shipping,exchange,pickupRequestId}' : '{shipping,pickupRequestId}'
