import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { shippingProxy } from '~/server/utils/shipping-proxy'
import { isNdrException, ndrVerdict, type NdrState } from '~/utils/ndr'

/**
 * Every shipment with a delivery exception, sorted into the three buckets the
 * NDR screen works in.
 *
 * NDR is never stored: Delhivery's own NSL code on the live track response is
 * the truth, and a parcel can leave the exception state on its own (it goes out
 * again the next morning). So this reads the orders that could be in trouble,
 * asks the carrier for their current state, and classifies what comes back.
 *
 * Buckets, and why an order lands in one:
 *   needAction  — the carrier will accept an action from us right now
 *                 (mapped NSL code, 1-2 attempts, nothing queued already)
 *   inProgress  — an action was submitted; its UPL id is stored on the order
 *   returnAdvised — the exception stands but no action is possible any more
 *                 (3+ attempts, an unmapped code, or the parcel is in RTO)
 */

// Only genuinely finished shipments are skipped. PLACED/PACKED are deliberately
// NOT skipped: the stored status lags the carrier, so a parcel can sit at PACKED
// locally while Delhivery has already failed a delivery on it.
const SETTLED = ['DELIVERED', 'CANCELLED', 'RTO_DELIVERED', 'RETURNED']

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // A parcel that failed months ago is not something anyone is still resolving;
  // the window keeps the carrier calls (50 waybills each) proportionate.
  const { days = '45' } = getQuery(event) as { days?: string }
  const window = Math.min(Math.max(Number(days) || 45, 1), 180)

  const { rows } = await pool.query(
    `SELECT o.id,
            o.order_number                        AS "orderNumber",
            o.status,
            o.payment_method                      AS "paymentMethod",
            o.payment_status                      AS "paymentStatus",
            o.grand_total                         AS "grandTotal",
            o.items,
            o.updated_at                          AS "updatedAt",
            o.created_at                          AS "createdAt",
            COALESCE(o.meta->>'awb', o.meta#>>'{shipping,awb}') AS awb,
            o.meta#>'{shipping,ndr,upl}'          AS upl,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', o.shipping_address->>'firstName',
                                         o.shipping_address->>'lastName')), ''),
              c.name)                             AS consignee,
            COALESCE(o.shipping_address->>'phoneNo', o.shipping_address->>'phone', c.phone) AS phone,
            o.shipping_address->>'city'           AS city,
            o.shipping_address->>'pincode'        AS pincode
     FROM ecomm_orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.company_id = $1
       AND COALESCE(o.meta->>'awb', o.meta#>>'{shipping,awb}') IS NOT NULL
       AND o.status <> ALL($2::text[])
       AND o.created_at > now() - ($3 || ' days')::interval
     ORDER BY o.updated_at DESC`,
    [companyId, SETTLED, String(window)],
  )
  if (!rows.length) return { needAction: [], inProgress: [], returnAdvised: [], checked: 0 }

  // Live state, 50 waybills per call (the carrier's limit).
  const live: Record<string, NdrState> = {}
  const awbs = [...new Set(rows.map((r) => r.awb as string).filter(Boolean))]
  for (let i = 0; i < awbs.length; i += 50) {
    try {
      const res: any = await shippingProxy(event, {
        method: 'GET', path: 'track-bulk', query: { waybills: awbs.slice(i, i + 50).join(',') },
      })
      Object.assign(live, res?.statuses || {})
    } catch {
      // A carrier outage must not blank the screen - the orders still list,
      // just without their live state, and the next refresh picks them up.
    }
  }

  const itemSummary = (items: any) => {
    const list = Array.isArray(items) ? items : []
    const names = list.map((i: any) => i.name || i.variantName || 'Item')
    const count = list.reduce((n: number, i: any) => n + Number(i.quantity || i.qty || 1), 0)
    return { count, text: names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') }
  }

  const needAction: any[] = []
  const inProgress: any[] = []
  const returnAdvised: any[] = []

  for (const row of rows) {
    const state = live[row.awb] || {}
    const rto = (state.status || row.status || '').startsWith('RTO')

    // Same rules the screens apply - utils/ndr.ts.
    if (!isNdrException(state) && !rto && !row.upl) continue
    const verdict = ndrVerdict(state)

    const item = itemSummary(row.items)
    const entry = {
      orderId: row.id,
      orderNumber: row.orderNumber,
      awb: row.awb,
      consignee: row.consignee,
      phone: row.phone,
      city: row.city,
      pincode: row.pincode,
      itemCount: item.count,
      products: item.text,
      grandTotal: Number(row.grandTotal || 0),
      // COD is the seller's real risk on an NDR, so it is a first-class column.
      paymentMode: /cod|cash/i.test(row.paymentMethod || '') ? 'COD' : 'Prepaid',
      paymentStatus: row.paymentStatus,
      status: state.status || row.status,
      // Always the carrier's own wording next to our classification.
      ndrType: verdict.reason,
      nsl: verdict.nsl,
      attempts: verdict.attempts,
      action: verdict.action,
      actionable: verdict.actionable,
      blockedReason: verdict.blockedReason,
      upl: row.upl || null,
      lastUpdated: row.updatedAt,
    }

    if (row.upl) inProgress.push(entry)
    else if (verdict.actionable) needAction.push(entry)
    else returnAdvised.push(entry)
  }

  return { needAction, inProgress, returnAdvised, checked: awbs.length }
})
