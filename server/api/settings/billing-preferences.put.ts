import { createError, defineEventHandler, getQuery, readBody } from 'h3'
import { pool } from '../../db'
import { getReadCompanyId } from '../../utils/organizationReadScope'
import { billingDocumentKind, normalizeBillingPreferences } from '../../../utils/billing-preferences'
import { invoicePaymentTerms } from '../../../utils/invoice-payment-terms'
import { readInvoicePaymentTerms } from '../../utils/invoice-payment-terms'
import { billingPreferenceRoles, saveBillingPreferences } from '../../utils/billing-preferences'

export default defineEventHandler(async event => {
  const companyId = await getReadCompanyId(event), session = await requireAuthSession(event)
  if (!billingPreferenceRoles.includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Only administrators, managers and accountants can change billing preferences.' })
  let kind, value
  try { kind = billingDocumentKind(getQuery(event).document); value = normalizeBillingPreferences(await readBody(event), kind) }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    if (!(await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])).rows.length) throw createError({ statusCode: 404, statusMessage: 'Company not found.' })
    if (kind === 'invoice' && ![...invoicePaymentTerms, ...await readInvoicePaymentTerms(db, companyId)].some(term => term.id === value.paymentTermId)) throw createError({ statusCode: 400, statusMessage: 'Select a payment term belonging to this company.' })
    await saveBillingPreferences(db, companyId, kind, value)
    await db.query('COMMIT')
    return { preferences: value, canManage: true }
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
})
