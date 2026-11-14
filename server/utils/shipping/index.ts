import type { H3Event } from 'h3'
import { pool } from '../../db'
import { useCompanyRequestSession } from '../companyRequestScope'
import { shippingError } from './http'
import { createShippingService, type ShippingOptions } from './service'
import type { ShippingDB } from './cartonization'

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
    return await createShippingService(db, companyId, globalThis.fetch).run(opts)
  } finally { connection.release() }
}

export async function runShippingBinary(event: H3Event, opts: ShippingOptions): Promise<{ body: Buffer; contentType: string }> {
  return runShippingOperation(event, opts)
}
