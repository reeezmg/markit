import { createError, defineEventHandler, readBody } from 'h3'
import { pool } from '../../db'
import { quoteCompany } from '../../utils/erp-quotes'
import { saveQuotePreferences } from '../../utils/quote-preferences'
import { normalizeQuotePreferences } from '../../../utils/quote-preferences'
export default defineEventHandler(async event => {
  const { companyId } = await quoteCompany(event, true, 'sales orders')
  const session = await requireAuthSession(event)
  if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Only administrators, managers and accountants can change sales order preferences.' })
  let value
  try {
    const body = await readBody(event)
    if (JSON.stringify(body).length > 2000000) throw Error('Quote preferences are too large. Use smaller images.')
    value = normalizeQuotePreferences(body)
  }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    await saveQuotePreferences(db, companyId, value, 'sales-orders')
    await db.query('COMMIT')
    return { preferences: value, canManage: true }
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
})
