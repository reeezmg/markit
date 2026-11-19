import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { pool } from '../../db'
import { getReadCompanyId } from '../../utils/organizationReadScope'
import { billingDocumentKind } from '../../../utils/billing-preferences'
import { invoicePaymentTerms } from '../../../utils/invoice-payment-terms'
import { readInvoicePaymentTerms } from '../../utils/invoice-payment-terms'
import { billingPreferenceRoles, readBillingPreferences } from '../../utils/billing-preferences'

export default defineEventHandler(async event => {
  const companyId = await getReadCompanyId(event), session = await requireAuthSession(event)
  let kind
  try { kind = billingDocumentKind(getQuery(event).document) }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  setHeader(event, 'Cache-Control', 'no-store')
  return { ...await readBillingPreferences(pool, companyId, kind), canManage: billingPreferenceRoles.includes(session.data.role),
    terms: kind === 'invoice' ? [...invoicePaymentTerms, ...await readInvoicePaymentTerms(pool, companyId)] : [] }
})
