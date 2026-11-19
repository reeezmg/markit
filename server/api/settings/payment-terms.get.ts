import { defineEventHandler, setHeader } from 'h3'
import { pool } from '../../db'
import { getReadCompanyId } from '../../utils/organizationReadScope'
import { paymentTermRoles, readInvoicePaymentTerms } from '../../utils/invoice-payment-terms'

export default defineEventHandler(async event => {
  const companyId = await getReadCompanyId(event)
  const session = await requireAuthSession(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return { terms: await readInvoicePaymentTerms(pool, companyId), canCreate: paymentTermRoles.includes(session.data.role) }
})
