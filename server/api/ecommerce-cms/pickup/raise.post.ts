import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { shippingProxy } from '~/server/utils/shipping-proxy'

// Raise a pickup request per selected carrier. Auto-attaches all remaining
// shipped-but-unpicked orders for that location+carrier, calls the carrier's
// pickup API, records a pickup-request row (status REQUESTED), and tags each
// attached order with its pickupRequestId so it isn't picked up twice.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { location, date, time = '12:00:00', carriers } = await readBody<{
    location: string; date: string; time?: string; carriers: string[]
  }>(event)
  if (!location || !date || !carriers?.length) {
    throw createError({ statusCode: 400, statusMessage: 'location, date and at least one carrier are required' })
  }

  const results: any[] = []
  for (const carrier of carriers) {
    // 1) remaining orders for this location + carrier
    const { rows } = await pool.query(
      `SELECT id FROM ecomm_orders
       WHERE company_id = $1 AND status = 'SHIPPED'
         AND meta->'shipping'->>'provider' = $2
         AND (meta->'shipping'->>'location' = $3 OR meta->'shipping'->>'location' IS NULL)
         AND (meta->'shipping'->>'pickupRequestId') IS NULL`,
      [companyId, carrier, location],
    )
    const orderIds: string[] = rows.map((r) => r.id)

    // 2) call the carrier's pickup API (outside the DB transaction)
    let carrierPickupId: any = null
    try {
      const resp: any = await shippingProxy(event, {
        method: 'POST', path: 'pickup',
        body: {
          pickupLocation: location, pickupDate: date, pickupTime: time,
          expectedPackageCount: orderIds.length || 1, provider: carrier,
        },
      })
      carrierPickupId = resp?.pickupId ?? null
    } catch (e: any) {
      results.push({ carrier, ok: false, error: e?.statusMessage || 'Carrier pickup failed' })
      continue
    }

    // 3) persist the request + tag its orders
    const reqId = crypto.randomUUID()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO ecomm_pickup_requests
           (id, company_id, location, carrier, pickup_date, pickup_time, package_count, status, carrier_pickup_id, order_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,$9::jsonb)`,
        [reqId, companyId, location, carrier, date, time, orderIds.length, carrierPickupId, JSON.stringify(orderIds)],
      )
      if (orderIds.length) {
        await client.query(
          `UPDATE ecomm_orders
           SET meta = jsonb_set(meta, '{shipping,pickupRequestId}', to_jsonb($1::text), true),
               updated_at = now()
           WHERE company_id = $2 AND id = ANY($3::text[])`,
          [reqId, companyId, orderIds],
        )
      }
      await client.query('COMMIT')
      results.push({ carrier, ok: true, requestId: reqId, orders: orderIds.length })
    } catch (e) {
      await client.query('ROLLBACK')
      results.push({ carrier, ok: false, error: 'Failed to record pickup request' })
    } finally {
      client.release()
    }
  }
  return { results }
})
