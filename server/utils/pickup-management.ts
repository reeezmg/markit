import { createError } from 'h3'
import { PICKUP_SHIPMENTS_SQL, pickupTagPath } from './pickup-shipments'

type DB = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }

/** Fail before booking a real carrier pickup when the prepared migration is pending. */
export async function requirePickupScheduleSchema(db: DB) {
  try {
    await db.query('SELECT requested_pickup_date, requested_pickup_time, carrier_schedule, carrier_response FROM ecomm_pickup_requests LIMIT 0')
  } catch (error: any) {
    if (error?.code === '42703') throw createError({ statusCode: 503, statusMessage: 'Pickup schedule migration is pending. Apply the prepared migration before booking or recording carrier slots.' })
    throw error
  }
}

/** Caller owns the transaction; pickup and order locks serialize competing assignments. */
export async function addPickupShipments(db: DB, companyId: string, requestId: string, shipmentIds: string[]) {
  const ids = [...new Set(shipmentIds)]
  if (!requestId || !ids.length || ids.length > 500 || ids.some(id => !/^.+:(forward|exchange)$/.test(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Select between 1 and 500 valid parcels' })
  }
  const { rows: pickups } = await db.query(
    `SELECT id, location, carrier, status, carrier_pickup_id, order_ids FROM ecomm_pickup_requests
     WHERE company_id=$1 AND id=$2 FOR UPDATE`, [companyId, requestId])
  const pickup = pickups[0]
  if (!pickup) throw createError({ statusCode: 404, statusMessage: 'Pickup not found' })
  if (pickup.status !== 'REQUESTED' || !pickup.carrier_pickup_id) {
    throw createError({ statusCode: 409, statusMessage: 'Choose an open carrier pickup' })
  }
  const existing: string[] = Array.isArray(pickup.order_ids) ? pickup.order_ids.map(String) : []
  const selected = ids.filter(id => !existing.includes(id) && !(id.endsWith(':forward') && existing.includes(id.slice(0, -8))))
  if (!selected.length) return { added: 0, count: existing.length }
  const orderIds = [...new Set(selected.map(id => id.replace(/:(forward|exchange)$/, '')))].sort()
  await db.query(`SELECT id FROM ecomm_orders WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR UPDATE`, [companyId, orderIds])
  const { rows: eligible } = await db.query(
    `SELECT s.id, s."orderId", s.kind FROM (${PICKUP_SHIPMENTS_SQL}) s WHERE s.id=ANY($4::text[])`,
    [companyId, pickup.carrier, pickup.location, selected])
  if (eligible.length !== selected.length) {
    throw createError({ statusCode: 409, statusMessage: 'Some parcels are no longer available, belong to another pickup, or have a different carrier/location. Refresh and select again.' })
  }
  for (const kind of ['forward', 'exchange']) {
    const legIds = eligible.filter(row => row.kind === kind).map(row => row.orderId)
    if (!legIds.length) continue
    await db.query(`UPDATE ecomm_orders SET meta=jsonb_set(meta,'${pickupTagPath(kind)}',to_jsonb($3::text),true),updated_at=now()
      WHERE company_id=$1 AND id=ANY($2::text[])`, [companyId, legIds, requestId])
  }
  const combined = [...existing, ...selected]
  await db.query(`UPDATE ecomm_pickup_requests SET order_ids=$3::jsonb,package_count=$4,updated_at=now()
    WHERE company_id=$1 AND id=$2`, [companyId, requestId, JSON.stringify(combined), combined.length])
  return { added: selected.length, count: combined.length }
}

/** This records a slot copied from the carrier portal; it never reschedules a booking. */
export function carrierScheduleInput(body: any) {
  const { date, startTime, endTime } = body || {}
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    || typeof startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    || typeof endTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) {
    throw createError({ statusCode: 400, statusMessage: 'Enter the carrier date and a valid start/end time slot' })
  }
  return { date, startTime, endTime, source: 'manual', recordedAt: new Date().toISOString() }
}
