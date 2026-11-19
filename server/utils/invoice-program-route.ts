import { createError, defineEventHandler, getQuery, getRouterParam, readBody, setHeader } from 'h3'
import { pool } from '../db'
import { quoteCompany } from './erp-quotes'

export function invoiceProgramRoute(write: boolean, run: (db: any, context: {companyId: string; userId: string}, body: any, id: string) => Promise<any>) {
  return defineEventHandler(async event => {
    const context = await quoteCompany(event, write, 'invoice programs')
    const body = write ? await readBody(event) : {}
    if (write && (!body || typeof body !== 'object' || Array.isArray(body))) throw createError({statusCode:400,statusMessage:'Enter the document details.'})
    const db = await pool.connect()
    setHeader(event, 'Cache-Control', 'no-store')
    try {
      await db.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      if (write) {
        await db.query("SET LOCAL statement_timeout='15s'")
        await db.query("SET LOCAL lock_timeout='5s'")
        await db.query(`SELECT set_config('app.status_source','bill.credit-receipt',true),set_config('app.status_actor',$1,true)`, ['user:' + context.userId])
      }
      const result = await run(db, context, write ? body : getQuery(event), getRouterParam(event, 'id') || '')
      await db.query('COMMIT')
      return result
    } catch (error: any) {
      await db.query('ROLLBACK')
      if (error.code === '42P01' && /recurring_invoice|retainer_/.test(error.message || '')) throw createError({statusCode:503,statusMessage:'Invoice programs require the prepared database migration to be applied before use.'})
      throw error
    } finally { db.release() }
  })
}

