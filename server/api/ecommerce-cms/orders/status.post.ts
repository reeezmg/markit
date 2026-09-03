import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { ORDER_STATUS } from '~/utils/order-status'
import { cancelEcommOrder, writeStatusHistory } from '~/server/utils/ecomm-order-cancel'

/**
 * Set an order's status by hand.
 *
 * Normally status comes from the carrier and is never typed in — that is what
 * makes the Status column trustworthy. This endpoint is the deliberate escape
 * hatch for the cases the carrier cannot describe: a parcel handed over in
 * person, an order the customer collected from the shop, a webhook that never
 * arrived. Every manual change is written to the timeline with source 'manual'
 * and the seller's note, so the override is always visible as an override.
 *
 * Choosing CANCELLED is not a status write — it is a cancellation, so it runs
 * the full rollback (stock, bill, coupon) instead. The waybill is NOT released
 * here; the orders table sends cancellations to /orders/cancel, which does the
 * carrier leg first.
 *
 * Body: { orderId, status, note? }
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ orderId?: string; status?: string; note?: string }>(event)
  const orderId = String(body?.orderId || '').trim()
  const status = String(body?.status || '').trim().toUpperCase()
  const note = body?.note?.trim() || null

  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })
  if (!ORDER_STATUS[status]) {
    throw createError({ statusCode: 400, statusMessage: `Unknown status "${status}"` })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (status === 'CANCELLED') {
      const result = await cancelEcommOrder(client, companyId, orderId, {
        source: 'manual',
        note: note ? `Cancelled manually — ${note}` : 'Cancelled manually',
      })
      await client.query('COMMIT')
      return { ok: true, status, cancelled: true, ...result }
    }

    const { rows } = await client.query(
      `SELECT status FROM ecomm_orders WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [orderId, companyId],
    )
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

    const previous = rows[0].status
    // A cancelled order has already had its stock put back. Moving it forward
    // again would ship goods that are on the shelf as far as the books are
    // concerned, so it has to be re-created rather than revived.
    if (previous === 'CANCELLED') {
      throw createError({
        statusCode: 400,
        statusMessage: 'This order is cancelled and its stock has been returned — create a new order instead of reopening it',
      })
    }
    if (previous === status) {
      throw createError({ statusCode: 400, statusMessage: `The order is already ${ORDER_STATUS[status].label}` })
    }

    await client.query(
      `UPDATE ecomm_orders SET status = $1, updated_at = now() WHERE id = $2 AND company_id = $3`,
      [status, orderId, companyId],
    )
    await writeStatusHistory(client, companyId, orderId, status, {
      source: 'manual',
      note: note || `Set to ${ORDER_STATUS[status].label} by the seller`,
    })

    await client.query('COMMIT')
    return { ok: true, status, previous, cancelled: false }
  } catch (e: any) {
    await client.query('ROLLBACK')
    if (e?.statusCode) throw e
    throw createError({ statusCode: 500, statusMessage: e?.message || 'Could not update the status' })
  } finally {
    client.release()
  }
})
