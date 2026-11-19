import { defineEventHandler, setHeader } from 'h3'
import { pool } from '../../db'
import { quoteCompany } from '../../utils/erp-quotes'
import { readQuotePreferences } from '../../utils/quote-preferences'
export default defineEventHandler(async event => {
  const { companyId } = await quoteCompany(event)
  const session = await requireAuthSession(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return { preferences: await readQuotePreferences(pool, companyId), canManage: ['admin', 'manager', 'accountant'].includes(session.data.role) }
})
