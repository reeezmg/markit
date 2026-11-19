import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { pool } from '../../../db'
import { quoteCompany, readQuote } from '../../../utils/erp-quotes'
import { createQuoteShare } from '../../../utils/quote-share'
import { enqueueQuoteNotification } from '../../../utils/whatsapp-notifications'
export default defineEventHandler(async event => {
  const { companyId } = await quoteCompany(event, true)
  const id = getRouterParam(event, 'quoteId')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Select a quote.' })
  const db = await pool.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    const quote = await readQuote(db, companyId, id)
    const token = createQuoteShare(id, companyId, quote.revision)
    await enqueueQuoteNotification(db, companyId, quote)
    await db.query('COMMIT')
    setHeader(event, 'Cache-Control', 'no-store')
    return { path: `/quote/${token}`, quoteNumber: quote.quoteNumber, phone: quote.clientPhone }
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
})
