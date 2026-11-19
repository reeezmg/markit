import { timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { pool } from '../../db'
import { processRecurringInvoices } from '../../utils/recurring-invoices'
export default defineEventHandler(async event => {
  const secret = process.env.CRON_SECRET
  const supplied = Buffer.from(getHeader(event, 'authorization') || ''), expected = Buffer.from('Bearer ' + (secret || ''))
  if (!secret || secret.length < 16 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw createError({statusCode:401,statusMessage:'Unauthorized'})
  setHeader(event, 'Cache-Control', 'no-store')
  const result = await processRecurringInvoices(pool)
  if (result.failed) throw createError({statusCode:500,statusMessage:'Some recurring invoices failed. Review the profiles and retry.',data:result})
  return result
})

