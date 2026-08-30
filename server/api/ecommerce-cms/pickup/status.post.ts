import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { pickupTagPath } from '~/server/utils/pickup-shipments'

const ALLOWED = ['REQUESTED', 'PICKED', 'CANCELLED']

// Update a pickup request's status. Cancelling releases its parcels (clears
// their pickupRequestId) so they become available for a future pickup again.
//
// order_ids holds shipment ids ("<orderId>:<forward|exchange>"); rows written
// before pickups became shipment-keyed hold bare order ids, which are read as
// forward legs.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { id, status } = await readBody<{ id: string; status: string }>(event)
  if (!id || !ALLOWED.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid id and status (REQUESTED|PICKED|CANCELLED) required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT order_ids FROM ecomm_pickup_requests WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [id, companyId],
    )
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Pickup request not found' })

    await client.query(
      `UPDATE ecomm_pickup_requests SET status = $1, updated_at = now() WHERE id = $2 AND company_id = $3`,
      [status, id, companyId],
    )

    const stored: string[] = rows[0].order_ids || []
    const legs = stored.map((entry) => {
      const [orderId, kind] = String(entry).split(':')
      return { orderId, kind: kind === 'exchange' ? 'exchange' : 'forward' }
    })

    if (status === 'CANCELLED' && legs.length) {
      // Clear the tag from the leg that was on the pickup, not from the order.
      for (const kind of ['forward', 'exchange']) {
        const ids = legs.filter((l) => l.kind === kind).map((l) => l.orderId)
        if (!ids.length) continue
        await client.query(
          `UPDATE ecomm_orders SET meta = meta #- '${pickupTagPath(kind)}', updated_at = now()
           WHERE company_id = $1 AND id = ANY($2::text[])`,
          [companyId, ids],
        )
      }
    }
    // Marking the pickup PICKED advances its orders to PICKED. Only from a
    // pre-pickup status — never regress one the carrier already moved on.
    // MANIFESTED/NOT_PICKED are the normal states here now that statuses are
    // synced from tracking; PLACED/PACKED cover rows written before that.
    //
    // Forward legs only: an exchange replacement leaving the warehouse says
    // nothing about the original order, which was delivered long ago.
    const forwardIds = legs.filter((l) => l.kind === 'forward').map((l) => l.orderId)
    if (status === 'PICKED' && forwardIds.length) {
      const upd = await client.query(
        `UPDATE ecomm_orders SET status = 'PICKED', updated_at = now()
         WHERE company_id = $1 AND id = ANY($2::text[])
           AND status IN ('PLACED', 'PACKED', 'MANIFESTED', 'NOT_PICKED')
         RETURNING id`,
        [companyId, forwardIds],
      )
      const changed = upd.rows.map((r) => r.id)
      if (changed.length) {
        await client.query(
          `INSERT INTO ecomm_order_status_history (company_id, order_id, status, source, note)
           SELECT $1, unnest($2::text[]), 'PICKED', 'pickup', 'Picked up by carrier'`,
          [companyId, changed],
        )
      }
    }
    await client.query('COMMIT')
    return { ok: true, status }
  } catch (e: any) {
    await client.query('ROLLBACK')
    if (e?.statusCode) throw e
    throw createError({ statusCode: 500, statusMessage: 'Failed to update pickup status' })
  } finally {
    client.release()
  }
})
