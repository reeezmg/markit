import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { shippingProxy } from '~/server/utils/shipping-proxy'
import { PICKUP_SHIPMENTS_SQL, pickupTagPath } from '~/server/utils/pickup-shipments'

// Raise a pickup request per selected carrier. Auto-attaches all remaining
// shipped-but-unpicked orders for that location+carrier, calls the carrier's
// pickup API, records a pickup-request row (status REQUESTED), and tags each
// attached order with its pickupRequestId so it isn't picked up twice.
// Awaiting pickup = the carrier has a waybill for it but has not collected
// it yet: MANIFESTED or NOT_PICKED (PACKED covers older rows written before
// statuses were synced from tracking). SHIPPED means already in transit —
// filtering on that matched parcels the carrier had ALREADY taken.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{
    // shipmentIds are "<orderId>:<forward|exchange>" - a pickup collects
    // shipments, and one order can contribute a forward parcel and a REPL
    // replacement that are handed over independently.
    location: string; date: string; time?: string; carriers: string[]; shipmentIds?: string[]
  }>(event)
  const { location, date, time = '12:00:00', carriers } = body
  if (!location || !date || !carriers?.length) {
    throw createError({ statusCode: 400, statusMessage: 'location, date and at least one carrier are required' })
  }

  const results: any[] = []
  for (const carrier of carriers) {
    // 0) Delhivery allows only ONE open pickup per warehouse per day — a second
    // one is accepted only once the first is closed. Catch it here so the seller
    // gets a clear message instead of a carrier rejection.
    const { rows: open } = await pool.query(
      `SELECT id, pickup_time AS "pickupTime", package_count AS "packageCount"
       FROM ecomm_pickup_requests
       WHERE company_id = $1 AND location = $2 AND carrier = $3
         AND pickup_date = $4 AND status = 'REQUESTED'
       LIMIT 1`,
      [companyId, location, carrier, date],
    )
    if (open.length) {
      results.push({
        carrier,
        ok: false,
        error: `A pickup for ${location} on ${date} at ${open[0].pickupTime} is already open `
             + `(${open[0].packageCount} parcel(s)). Mark it picked or cancel it before raising another.`,
      })
      continue
    }

    // 1) the shipments this pickup would collect (forward + exchange legs)
    // The caller may nominate exactly which parcels to hand over. Selected ids
    // are still re-checked against the awaiting-pickup rule, so a stale
    // selection cannot attach a parcel that has already moved on.
    const chosen: string[] | undefined = Array.isArray(body?.shipmentIds) ? body.shipmentIds : undefined
    const { rows } = await pool.query(
      `SELECT id, "orderId", kind, awb FROM (${PICKUP_SHIPMENTS_SQL}) s
       WHERE ($4::text[] IS NULL OR s.id = ANY($4::text[]))`,
      [companyId, carrier, location, chosen ?? null],
    )
    const shipments = rows as { id: string; orderId: string; kind: string; awb: string }[]

    // An explicit empty selection means "nothing" — never fall through to all.
    if (chosen && !shipments.length) {
      results.push({ carrier, ok: false, error: 'None of the selected parcels are still awaiting pickup.' })
      continue
    }

    // 2) call the carrier's pickup API (outside the DB transaction)
    let carrierPickupId: any = null
    try {
      const resp: any = await shippingProxy(event, {
        method: 'POST', path: 'pickup',
        body: {
          pickupLocation: location, pickupDate: date, pickupTime: time,
          expectedPackageCount: shipments.length || 1, provider: carrier,
        },
      })
      carrierPickupId = resp?.pickupId ?? null
    } catch (e: any) {
      results.push({ carrier, ok: false, error: e?.statusMessage || 'Carrier pickup failed' })
      continue
    }

    // 3) persist the request + tag each shipment that is on it
    const reqId = crypto.randomUUID()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        // updated_at is NOT NULL with no database default (Prisma drives it via
        // @updatedAt, which raw SQL bypasses) — omitting it made every pickup
        // insert fail, *after* the carrier had already booked the pickup.
        `INSERT INTO ecomm_pickup_requests
           (id, company_id, location, carrier, pickup_date, pickup_time, package_count, status, carrier_pickup_id, order_ids, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,$9::jsonb, now())`,
        [reqId, companyId, location, carrier, date, time, shipments.length, carrierPickupId,
         JSON.stringify(shipments.map((s) => s.id))],
      )
      // The tag goes on the leg that was handed over, so an order's forward
      // parcel and its exchange replacement are tracked separately.
      for (const kind of ['forward', 'exchange']) {
        const ids = shipments.filter((s) => s.kind === kind).map((s) => s.orderId)
        if (!ids.length) continue
        await client.query(
          `UPDATE ecomm_orders
           SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '${pickupTagPath(kind)}', to_jsonb($1::text), true),
               updated_at = now()
           WHERE company_id = $2 AND id = ANY($3::text[])`,
          [reqId, companyId, ids],
        )
      }
      await client.query('COMMIT')
      results.push({ carrier, ok: true, requestId: reqId, orders: shipments.length })
    } catch (e: any) {
      await client.query('ROLLBACK')
      // The carrier was called first, so at this point the pickup IS booked even
      // though we failed to record it. Surface the carrier's id — without it the
      // booking is invisible and would be raised again.
      results.push({
        carrier,
        ok: false,
        carrierPickupId,
        error: carrierPickupId
          ? `Pickup WAS booked with ${carrier} (id ${carrierPickupId}) but could not be saved locally: ${e?.message || 'database error'}. Do not raise it again — record it manually.`
          : `Failed to record pickup request: ${e?.message || 'database error'}`,
      })
    } finally {
      client.release()
    }
  }
  return { results }
})
