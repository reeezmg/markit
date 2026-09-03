import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { cancelEcommOrder } from '~/server/utils/ecomm-order-cancel'
import { shippingProxy } from '~/server/utils/shipping-proxy'

/**
 * Cancel an ecommerce order from the seller side, stock and all.
 *
 * This is NOT the same thing as "Cancel shipment", which only releases the
 * waybill and drops the order back to Packed so it can ship again. Cancelling
 * the ORDER ends it: the goods go back on the shelf, the bill is voided and any
 * coupon it spent is handed back.
 *
 * Order of operations matters. The carrier is the only part we cannot roll
 * back, so it goes first, outside the transaction: if Delhivery refuses the
 * cancellation there is still a live waybill against the order and we must not
 * cancel it in our database. Once the waybill is released, the database work
 * runs as one transaction that either lands whole or not at all.
 *
 * Body: { orderId, reason?, force?, ignoreCarrierError? }
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{
    orderId?: string
    reason?: string
    force?: boolean
    ignoreCarrierError?: boolean
  }>(event)

  const orderId = String(body?.orderId || '').trim()
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })

  // ── Carrier leg ──────────────────────────────────────────────────────────
  // Read the AWB before anything else; the shipping proxy's own handler clears
  // it from meta when the carrier accepts.
  const { rows: pre } = await pool.query(
    `SELECT status, meta FROM ecomm_orders WHERE id = $1 AND company_id = $2`,
    [orderId, companyId],
  )
  if (!pre.length) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

  const shipping = pre[0].meta?.shipping || {}
  const awb: string | null = shipping.awb || shipping.trackingId || null

  let shipmentCancelled = false
  let carrierError: string | null = null
  if (awb) {
    try {
      await shippingProxy(event, { method: 'POST', path: 'cancel', body: { awb, orderId } })
      shipmentCancelled = true
    } catch (e: any) {
      carrierError = e?.statusMessage || e?.message || 'The carrier refused the cancellation'
      // Without the waybill released, cancelling here would leave a live parcel
      // travelling against a cancelled order. The seller can override once they
      // know why — e.g. the shipment was already cancelled at the carrier.
      if (!body?.ignoreCarrierError) {
        // Single-line statusMessage on purpose — h3 strips newlines from it, so
        // the detail the seller needs travels in `data` instead.
        throw createError({
          statusCode: 409,
          statusMessage: 'The carrier refused to cancel the shipment — the order was left as it is',
          data: { carrierError, awb, needsOverride: true },
        })
      }
    }
  }

  // ── Database leg ─────────────────────────────────────────────────────────
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await cancelEcommOrder(client, companyId, orderId, {
      source: 'seller',
      note: body?.reason?.trim()
        ? `Cancelled by seller — ${body.reason.trim()}`
        : 'Cancelled by seller',
      force: Boolean(body?.force),
    })
    await client.query('COMMIT')
    return { ok: true, ...result, shipmentCancelled, carrierError }
  } catch (e: any) {
    await client.query('ROLLBACK')
    if (e?.statusCode) throw e
    throw createError({ statusCode: 500, statusMessage: e?.message || 'Could not cancel the order' })
  } finally {
    client.release()
  }
})
