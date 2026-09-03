import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { PoolClient } from 'pg'

/**
 * Cancelling an ecommerce order, owned by storetools.
 *
 * This is the counterpart to checkout: checkout decrements `items.qty` and
 * increments `sold_qty` as it writes the bill, so cancelling has to put both
 * back. Everything here runs inside the CALLER's transaction — the stock
 * restore, the order/checkout/bill status flips and the coupon reversal must
 * either all land or none of them do, otherwise a half-cancelled order leaks
 * stock or leaves a coupon spent.
 *
 * The order's `items` JSON is the snapshot taken at checkout, and it is what we
 * restore from — not the live cart or the bill entries. It records exactly what
 * was taken out of stock for THIS order, so it stays correct even if the
 * product, variant or price has changed since.
 *
 * Carrier-side cancellation (releasing the waybill) is deliberately NOT here.
 * That is a call to the carrier, not a database write, and it has to succeed
 * before we start this transaction — see the `cancel` endpoint.
 */

/** Statuses a cancellation may not be applied to. */
const TERMINAL = new Set(['CANCELLED', 'DELIVERED', 'RTO_DELIVERED', 'RETURNED'])

export interface CancelOptions {
  /** Free text stored on the status-history row. */
  note?: string
  /** Who asked for it — 'seller' from the orders table, 'customer' from a request. */
  source?: string
  /**
   * Cancel a DELIVERED / RTO_DELIVERED / RETURNED order anyway. Off by default:
   * restoring stock for a parcel the customer already has would invent stock
   * that is not on the shelf. A return is the correct instrument for those.
   */
  force?: boolean
}

export interface CancelResult {
  orderId: string
  orderNumber: number | null
  /** One entry per stock row actually put back. */
  restored: { itemId: string; quantity: number }[]
  /** Lines in the snapshot with no usable itemId — nothing could be restored for these. */
  unrestorable: number
  couponsReversed: number
  billCancelled: boolean
}

/**
 * Roll an order back: restore its stock, mark it (and its checkout and bill)
 * cancelled, reverse any coupon it consumed, and record the change.
 *
 * `db` must already be inside a transaction.
 */
export async function cancelEcommOrder(
  db: PoolClient,
  companyId: string,
  orderId: string,
  opts: CancelOptions = {},
): Promise<CancelResult> {
  const { rows } = await db.query(
    `SELECT id, order_number, status, items, bill_id, checkout_id, client_id
     FROM ecomm_orders
     WHERE id = $1 AND company_id = $2
     FOR UPDATE`,
    [orderId, companyId],
  )
  const order = rows[0]
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

  // Cancelling twice would restore the stock twice and invent inventory, so the
  // status check is the guard that makes this endpoint safe to retry.
  if (order.status === 'CANCELLED') {
    throw createError({ statusCode: 400, statusMessage: 'This order is already cancelled' })
  }
  if (!opts.force && TERMINAL.has(order.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `An order that is ${order.status} cannot be cancelled — raise a return instead`,
    })
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  // Aggregate first: the same item can appear on more than one line (two sizes
  // of the same variant, or a line split at checkout), and one UPDATE per item
  // keeps the row lock count down.
  const snapshot: any[] = Array.isArray(order.items) ? order.items : []
  const quantities = new Map<string, number>()
  let unrestorable = 0
  for (const line of snapshot) {
    const itemId = String(line?.itemId ?? line?.item_id ?? '').trim()
    const quantity = Number(line?.quantity ?? line?.qty ?? 0)
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
      unrestorable += 1
      continue
    }
    quantities.set(itemId, (quantities.get(itemId) || 0) + quantity)
  }

  const restored: { itemId: string; quantity: number }[] = []
  for (const [itemId, quantity] of quantities) {
    // GREATEST on sold_qty: a bill edited after checkout can leave sold_qty
    // lower than this order's share, and a negative sold count is worse than an
    // imprecise one.
    const upd = await db.query(
      `UPDATE items
       SET qty = COALESCE(qty, 0) + $1,
           sold_qty = GREATEST(0, COALESCE(sold_qty, 0) - $1),
           updated_at = now()
       WHERE id = $2 AND company_id = $3
       RETURNING id`,
      [quantity, itemId, companyId],
    )
    // A missing row means the item was deleted since checkout. Nothing to put
    // stock back into, and it must not abort the cancellation.
    if (upd.rows.length) restored.push({ itemId, quantity })
    else unrestorable += 1
  }

  // ── Order, checkout, bill ────────────────────────────────────────────────
  await db.query(
    `UPDATE ecomm_orders SET status = 'CANCELLED', updated_at = now()
     WHERE id = $1 AND company_id = $2`,
    [orderId, companyId],
  )

  if (order.checkout_id) {
    // A cancelled checkout can no longer be settled by a late payment callback.
    await db.query(
      `UPDATE ecomm_checkouts SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1 AND company_id = $2`,
      [order.checkout_id, companyId],
    )
  }

  let billCancelled = false
  if (order.bill_id) {
    // The bills enum spells it CANCELED (one L) — ecomm_orders.status is free
    // text and spells it CANCELLED. Both are correct for their own column.
    const bill = await db.query(
      `UPDATE bills SET status = 'CANCELED', updated_at = now()
       WHERE id = $1 AND company_id = $2
       RETURNING id`,
      [order.bill_id, companyId],
    )
    billCancelled = bill.rows.length > 0
  }

  // ── Coupons ──────────────────────────────────────────────────────────────
  // Give the code back: drop the usage row, decrement the coupon's counter and,
  // for per-client coupons, hand the client their allowance back.
  let couponsReversed = 0
  if (order.bill_id) {
    const usages = await db.query(
      `DELETE FROM coupon_usages cu
       USING coupons c
       WHERE cu.coupon_id = c.id AND cu.bill_id = $1
       RETURNING cu.coupon_id, c.audience_type`,
      [order.bill_id],
    )
    for (const usage of usages.rows) {
      await db.query(
        `UPDATE coupons SET times_used = GREATEST(0, COALESCE(times_used, 0) - 1) WHERE id = $1`,
        [usage.coupon_id],
      )
      if (['GENERATE', 'SPECIFIC'].includes(usage.audience_type)) {
        // Exactly ONE row, mirroring the single-row decrement in checkout.
        // (coupon_id, client_id) is not unique here — real data has two rows
        // per pair — so a blanket UPDATE would hand back two uses for the one
        // that was spent.
        await db.query(
          `UPDATE coupon_clients SET usage_limit = usage_limit + 1
           WHERE id = (
             SELECT id FROM coupon_clients
             WHERE coupon_id = $1 AND client_id = $2 AND usage_limit IS NOT NULL
             ORDER BY "createdAt" ASC
             LIMIT 1
           )`,
          [usage.coupon_id, order.client_id],
        )
      }
      couponsReversed += 1
    }
  }

  // ── Any pending cancellation request is now answered ─────────────────────
  // The customer may have asked for this from the storefront and been left
  // waiting because the seller has auto-approve off. Cancelling here IS the
  // approval, so close the request rather than leaving it open forever.
  await db.query(
    `UPDATE ecomm_order_requests
     SET status = 'APPROVED', updated_at = now()
     WHERE order_id = $1 AND company_id = $2 AND type = 'cancellation' AND status = 'PENDING'`,
    [orderId, companyId],
  )

  await writeStatusHistory(db, companyId, orderId, 'CANCELLED', {
    source: opts.source || 'seller',
    note: opts.note || 'Order cancelled',
  })

  return {
    orderId,
    orderNumber: order.order_number ?? null,
    restored,
    unrestorable,
    couponsReversed,
    billCancelled,
  }
}

/**
 * Append a row to the order timeline.
 *
 * `id` is generated here on purpose: Prisma's `@default(uuid())` is applied by
 * the Prisma client, not by Postgres, so the column has no database default and
 * a raw INSERT that omits it fails on the NOT NULL.
 */
export async function writeStatusHistory(
  db: PoolClient,
  companyId: string,
  orderId: string,
  status: string,
  opts: { source: string; note?: string | null; rawStatus?: string | null; awb?: string | null } = { source: 'manual' },
) {
  await db.query(
    `INSERT INTO ecomm_order_status_history (id, company_id, order_id, status, raw_status, source, note, awb)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), companyId, orderId, status, opts.rawStatus ?? null, opts.source, opts.note ?? null, opts.awb ?? null],
  )
}
