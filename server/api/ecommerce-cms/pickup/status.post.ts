import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

const ALLOWED = ['REQUESTED', 'PICKED', 'CANCELLED']

// Update a pickup request's status. Cancelling releases its orders (clears
// pickupRequestId) so they become available for a future pickup again.
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

    const orderIds: string[] = rows[0].order_ids || []
    if (status === 'CANCELLED' && orderIds.length) {
      await client.query(
        `UPDATE ecomm_orders SET meta = meta #- '{shipping,pickupRequestId}', updated_at = now()
         WHERE company_id = $1 AND id = ANY($2::text[])`,
        [companyId, orderIds],
      )
    }
    // Marking the pickup PICKED advances its orders to PICKED (only from
    // PLACED/PACKED — never regress an already in-transit order) + logs history.
    if (status === 'PICKED' && orderIds.length) {
      const upd = await client.query(
        `UPDATE ecomm_orders SET status = 'PICKED', updated_at = now()
         WHERE company_id = $1 AND id = ANY($2::text[]) AND status IN ('PLACED', 'PACKED')
         RETURNING id`,
        [companyId, orderIds],
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
