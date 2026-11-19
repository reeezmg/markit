import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { pool } from '../db'
import { sharedQuote, verifyQuoteShare } from '../utils/quote-share'
import { patchQuoteWorkflow, convertAcceptedQuote } from '../utils/quote-workflow'
import { deliverQuoteInvoiceEmail } from '../utils/quote-invoice-email'
export default defineEventHandler(async event => {
  const body = await readBody(event)
  if (typeof body?.token !== 'string' || !['ACCEPTED', 'DECLINED'].includes(body.decision)) throw createError({ statusCode: 400, statusMessage: 'Select Accept or Decline.' })
  const signed = verifyQuoteShare(body.token), db = await pool.connect()
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    await db.query('BEGIN')
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [signed.companyId])
    await db.query('SELECT id FROM quotes WHERE id=$1 AND company_id=$2 FOR UPDATE', [signed.quoteId, signed.companyId])
    const result = await sharedQuote(db, body.token)
    const previous = result.quote.workflow?.response
    if (previous?.originalRevision === signed.revision && previous?.decision === body.decision) {
      await db.query('COMMIT')
      return { success: true, status: body.decision }
    }
    if (!result.publicData.canRespond) throw createError({ statusCode: 409, statusMessage: 'This quote cannot receive another response.' })
    const revision = randomUUID()
    const workflow = { ...result.quote.workflow, response: { decision: body.decision, at: new Date().toISOString(), originalRevision: signed.revision, resultRevision: revision } }
    await patchQuoteWorkflow(db, signed.companyId, signed.quoteId, workflow)
    await db.query(`UPDATE quote_custom_field_values SET field_values=jsonb_set(field_values,'{_erpQuote,revision}',to_jsonb($3::text),true) WHERE quote_id=$1 AND company_id=$2`, [signed.quoteId, signed.companyId, revision])
    await db.query('UPDATE quotes SET status=$3::"QuoteStatus" WHERE id=$1 AND company_id=$2', [signed.quoteId, signed.companyId, body.decision])
    if (body.decision === 'ACCEPTED') await convertAcceptedQuote(db, signed.companyId, signed.quoteId, 'quote-customer')
    await db.query('COMMIT')
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
  try { await deliverQuoteInvoiceEmail(pool, signed.companyId, signed.quoteId) } catch { /* Pending delivery remains available to staff for retry. */ }
  return { success: true, status: body.decision }
})
