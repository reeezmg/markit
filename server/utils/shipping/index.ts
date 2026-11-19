import type { H3Event } from 'h3'
import { pool } from '../../db'
import { useCompanyRequestSession } from '../companyRequestScope'
import { afterSalesAvailable, activateServiceAgreements, serviceLock } from '../after-sales-lifecycle'
import { shippingError } from './http'
import { createShippingService, type ShippingOptions } from './service'
import type { ShippingDB } from './cartonization'

async function recordDelivery(db: ShippingDB, companyId: string, orderId: string) {
  if (!await afterSalesAvailable(db)) return
  await serviceLock(db, companyId)
  const products = (await db.query(`UPDATE customer_products p SET delivered_on=COALESCE(p.delivered_on,
    (SELECT min(CASE WHEN pg_typeof(h.created_at)::text='timestamp with time zone'
      THEN (h.created_at AT TIME ZONE 'Asia/Kolkata')::date
      ELSE ((h.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date END)
     FROM ecomm_order_status_history h WHERE h.company_id=$1 AND h.order_id=$2 AND h.status='DELIVERED'),
     (now() AT TIME ZONE 'Asia/Kolkata')::date)
    WHERE p.company_id=$1 AND p.order_id=$2 AND p.status='ACTIVE'
    AND EXISTS(SELECT 1 FROM ecomm_orders o WHERE o.id=p.order_id AND o.company_id=p.company_id AND o.status='DELIVERED') RETURNING p.id`, [companyId, orderId])).rows
  for (const product of products) await activateServiceAgreements(db, companyId, product.id)
}

/** Seller endpoints call shipping in-process; no HTTP hop or shipping service token. */
export async function runShippingOperation(event: H3Event, opts: ShippingOptions) {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw shippingError('Unauthorized', 401)
  const connection = await pool.connect()
  try {
    const db: ShippingDB = { query: async (sql, params) => {
      const result = await connection.query(sql, params)
      if (sql === 'BEGIN') await connection.query(`SELECT set_config('app.status_source',$1,true),set_config('app.status_actor',$2,true)`,
        [opts.path === 'track-bulk' ? 'shipping.tracking' : 'shipping.seller', session.data?.id ? `user:${session.data.id}` : ''])
      return result
    } }
    return await createShippingService(db, companyId, globalThis.fetch, recordDelivery).run(opts)
  } finally { connection.release() }
}

export async function runShippingBinary(event: H3Event, opts: ShippingOptions): Promise<{ body: Buffer; contentType: string }> {
  return runShippingOperation(event, opts)
}
