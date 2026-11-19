import { timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { pool } from '../../db'
import { afterSalesAvailable, serviceLock } from '../../utils/after-sales-lifecycle'
import { processServices } from '../../utils/after-sales'
export default defineEventHandler(async event => {
  const secret = process.env.CRON_SECRET || '', supplied = Buffer.from(getHeader(event, 'authorization') || ''), expected = Buffer.from('Bearer ' + secret)
  if (secret.length < 16 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  setHeader(event, 'Cache-Control', 'no-store')
  const db = await pool.connect(), results: any[] = []
  try {
    if (!await afterSalesAvailable(db)) return { ready: false, results }
    const companies = (await db.query("SELECT DISTINCT company_id FROM customer_service_agreements WHERE status='ACTIVE' ORDER BY company_id")).rows
    for (const row of companies) {
      try { await db.query('BEGIN'); await serviceLock(db, row.company_id); results.push({ companyId: row.company_id, ...await processServices(db, row.company_id) }); await db.query('COMMIT') }
      catch (e: any) { await db.query('ROLLBACK'); results.push({ companyId: row.company_id, error: e.message }) }
    }
    if (results.some(r => r.error)) throw createError({ statusCode: 500, statusMessage: 'Some after-sales schedules failed.', data: results })
    return { ready: true, results }
  } finally { db.release() }
})
