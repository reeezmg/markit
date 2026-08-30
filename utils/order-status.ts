/**
 * The Markit order-status vocabulary.
 *
 * Every carrier speaks its own dialect — Delhivery says "Manifested", another
 * will say something else for the same moment. The shipping adapters convert
 * each carrier's wording into exactly one of these values (see
 * `canonical_status` in custom-api), so filters, colours, reporting and any
 * business logic only ever deal with this list.
 *
 * The carrier's own wording is never thrown away: it is shown alongside the
 * badge, so it is still there when you are on the phone with their support.
 */
export interface OrderStatusMeta {
  /** What the seller reads on the badge. */
  label: string;
  /** Nuxt UI badge colour. */
  color: string;
  /** What this state actually means, shown on hover. */
  hint: string;
}

export const ORDER_STATUS: Record<string, OrderStatusMeta> = {
  // ── Before a shipment exists ───────────────────────────────────────────────
  PLACED:           { label: 'Placed',           color: 'blue',   hint: 'Order received — no shipment created yet' },
  PACKED:           { label: 'Packed',           color: 'blue',   hint: 'Packed and ready, not handed to a carrier yet' },
  CANCELLED:        { label: 'Cancelled',        color: 'red',    hint: 'Order or shipment cancelled' },

  // ── Forward leg: on its way to the customer ───────────────────────────────
  MANIFESTED:       { label: 'Manifested',       color: 'cyan',   hint: 'Carrier notified — waiting to be collected from you' },
  NOT_PICKED:       { label: 'Not picked',       color: 'amber',  hint: 'A pickup happened but this parcel was not collected' },
  PICKED:           { label: 'Picked up',        color: 'sky',    hint: 'Collected by the carrier' },
  SHIPPED:          { label: 'In transit',       color: 'yellow', hint: 'Moving through the carrier network' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', color: 'lime',   hint: 'With a delivery agent for the final leg' },
  DELIVERED:        { label: 'Delivered',        color: 'green',  hint: 'Received by the customer' },
  UNDELIVERED:      { label: 'Undelivered',      color: 'red',    hint: 'Delivery attempt failed — needs a re-attempt or RTO' },

  // ── Return to origin: the customer never took it ──────────────────────────
  RTO:              { label: 'Returning to you',  color: 'orange', hint: 'Undelivered — on its way back to you' },
  RTO_DELIVERED:    { label: 'Returned to you',   color: 'orange', hint: 'Back at your pickup location' },

  // ── Reverse pickup: the customer is sending something back ────────────────
  PICKUP_SCHEDULED: { label: 'Pickup scheduled', color: 'violet', hint: 'Return pickup booked with the carrier' },
  OUT_FOR_PICKUP:   { label: 'Out for pickup',   color: 'violet', hint: 'Agent on the way to collect from the customer' },
  RETURNING:        { label: 'Coming back',      color: 'purple', hint: 'Collected from the customer, heading to you' },
  RETURNED:         { label: 'Return received',  color: 'purple', hint: 'Return received at your pickup location' },
};

/**
 * Statuses an ecommerce order can actually hold, in journey order — this is the
 * Status filter's option list.
 *
 * The reverse-pickup statuses are deliberately NOT here. A return travels on its
 * own waybill, stored under `meta.shipping.reverse`, while the status webhook
 * matches orders on `meta.awb` — so a reverse status never lands on the order
 * row. Listing them would give four filters that always come back empty. Their
 * labels stay defined above for the requests screens, which do track them.
 */
export const ORDER_STATUS_KEYS = [
  'PLACED', 'PACKED', 'MANIFESTED', 'NOT_PICKED', 'PICKED', 'SHIPPED',
  'OUT_FOR_DELIVERY', 'UNDELIVERED', 'DELIVERED',
  'RTO', 'RTO_DELIVERED',
  'CANCELLED',
];

/** Badge text. Falls back to the raw value so an unmapped status is visible
 *  rather than blank — a status we do not know is a mapping gap to fix. */
export const statusLabel = (status?: string | null) =>
  (status && ORDER_STATUS[status]?.label) || status || '—';

export const statusColor = (status?: string | null) =>
  (status && ORDER_STATUS[status]?.color) || 'gray';

export const statusHint = (status?: string | null) =>
  (status && ORDER_STATUS[status]?.hint) || '';
