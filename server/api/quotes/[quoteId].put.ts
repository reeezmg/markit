import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { pool } from '../../db'
import { quoteCompany, writeQuote } from '../../utils/erp-quotes'
import { deliverQuoteInvoiceEmail } from '../../utils/quote-invoice-email'

export default defineEventHandler(async event => {
  const context = await quoteCompany(event, true)
  const id = getRouterParam(event, 'quoteId')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Select a quote.' })
  const body = await readBody(event)
  const db = await pool.connect()
  let result
  try {
    await db.query('BEGIN')
    result = await writeQuote(db, context, body, id)
    await db.query('COMMIT')
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
  if (result.workflow?.emailStatus === 'Pending') {
    try { result.workflow = await deliverQuoteInvoiceEmail(pool, context.companyId, result.id) }
    catch { result.workflow = { ...result.workflow, emailError: 'Invoice created; retry email from the quote list.' } }
  }
  return result
})
