import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { pool } from '../../../db'
import { quoteCompany, readQuote } from '../../../utils/erp-quotes'
import { convertAcceptedQuote, patchQuoteWorkflow } from '../../../utils/quote-workflow'
import { deliverQuoteInvoiceEmail } from '../../../utils/quote-invoice-email'
export default defineEventHandler(async event => {
  const { companyId, userId } = await quoteCompany(event, true), id = getRouterParam(event, 'quoteId')
  const body = await readBody(event)
  if (!id || !['retry', 'issue', 'email'].includes(body?.action)) throw createError({ statusCode: 400, statusMessage: 'Select a quote action.' })
  const db = await pool.connect()
  let workflow: any
  try {
    await db.query('BEGIN')
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    await db.query('SELECT id FROM quotes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, companyId])
    const quote = await readQuote(db, companyId, id)
    if (body.action === 'email') {
      if (!quote.workflow.invoiceId) throw createError({ statusCode: 409, statusMessage: 'Issue the invoice before sending its email.' })
      workflow = { ...quote.workflow, emailStatus: quote.workflow.emailStatus === 'Sent' ? 'Sent' : 'Pending' }
      await patchQuoteWorkflow(db, companyId, id, workflow)
    } else {
      if (body.action === 'issue' && !quote.workflow.invoiceDraft) throw createError({ statusCode: 409, statusMessage: 'This quote has no invoice draft.' })
      workflow = await convertAcceptedQuote(db, companyId, id, userId, body.action === 'issue')
    }
    await db.query('COMMIT')
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
  if (workflow.emailStatus === 'Pending') workflow = await deliverQuoteInvoiceEmail(pool, companyId, id)
  return { success: !workflow.conversionError && workflow.emailStatus !== 'Failed', workflow }
})
