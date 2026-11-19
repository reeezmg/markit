import { defineEventHandler, readBody, getQuery, setHeader, getRouterParam } from 'h3'
import { pool } from '../db'
import { quoteCompany } from './erp-quotes'
import { afterSalesAvailable, serviceLock, serviceError } from './after-sales-lifecycle'

export function afterSalesRoute(write: boolean, run: (db: any, companyId: string, actor: string, input: any) => Promise<any>) {
  return defineEventHandler(async event => {
    const session=await requireAuthSession(event)
    if(!['admin','manager','accountant','biller','user'].includes(session.data.role)) throw serviceError('Staff access is required for after-sales.',403)
    const context = await quoteCompany(event, write, 'after-sales')
    const input = event.method === 'GET' ? getQuery(event) : await readBody(event)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw serviceError('Enter valid after-sales details.', 400)
    const db = await pool.connect()
    setHeader(event, 'Cache-Control', 'no-store')
    try {
      await db.query('BEGIN')
      if (!await afterSalesAvailable(db)) throw serviceError('After-sales requires the prepared database migration before use.', 503)
      if (write) await serviceLock(db, context.companyId)
      const result = await run(db, context.companyId, context.userId, { ...input, ...(getRouterParam(event, 'id') ? { id: getRouterParam(event, 'id') } : {}) })
      await db.query('COMMIT')
      return result
    } catch (error) { await db.query('ROLLBACK'); throw error } finally { db.release() }
  })
}
