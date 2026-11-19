import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'
import { readQuote } from './erp-quotes'
import { readQuotePreferences } from './quote-preferences'
import { readQuoteDocumentCompany, readQuoteDocumentCustomerAddress } from './quote-document'

function secret() {
  const value = process.env.QUOTE_SHARE_SECRET || process.env.RECEIPT_SHARE_SECRET || process.env.NUXT_SESSION_SECRET || process.env.SESSION_SECRET || process.env.NUXT_AUTH_PASSWORD
  if (!value || value.length < 32) throw createError({ statusCode: 503, statusMessage: 'Quote sharing needs a configured signing secret.' })
  return value
}
export function createQuoteShare(quoteId: string, companyId: string, revision: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ quoteId, companyId, revision, expires: now + 30 * 86400000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret()).update('quote-share:' + payload).digest('base64url')}`
}
export function verifyQuoteShare(token: string, now = Date.now()): { quoteId: string; companyId: string; revision: string; expires: number } {
  const invalid = () => createError({ statusCode: 404, statusMessage: 'This quote link is invalid, outdated or expired.' })
  if (typeof token !== 'string' || token.length > 3000) throw invalid()
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw invalid()
  const expected = createHmac('sha256', secret()).update('quote-share:' + payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid()
  let value: any
  try { value = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { throw invalid() }
  if (!value.quoteId || typeof value.quoteId !== 'string' || !value.companyId || typeof value.companyId !== 'string' || typeof value.revision !== 'string' || !Number.isFinite(value.expires) || value.expires <= now) throw invalid()
  return value
}
export const quoteExpired = (quote: any, now = new Date()) => !!quote.expiryDate && quote.expiryDate < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export async function sharedQuote(db: any, token: string) {
  const signed = verifyQuoteShare(token)
  const quote = await readQuote(db, signed.companyId, signed.quoteId)
  const response = quote.workflow?.response
  if (quote.revision !== signed.revision && !(response?.originalRevision === signed.revision && response?.resultRevision === quote.revision))
    throw createError({ statusCode: 404, statusMessage: 'This quote was updated. Ask the sender for a new link.' })
  const preferences = await readQuotePreferences(db, signed.companyId)
  const company = await readQuoteDocumentCompany(db, signed.companyId)
  const clientAddress = await readQuoteDocumentCustomerAddress(db, signed.companyId, quote.clientId)
  const { workflow, createdByUserId, clientId, ...document } = quote
  return { signed, quote, preferences, publicData: { quote: { ...document, clientAddress, documentDesign: preferences.documentDesign }, company,
    canRespond: preferences.allowCustomerApproval && ['DRAFT', 'SENT'].includes(quote.status) && !quoteExpired(quote),
    expired: quoteExpired(quote), conversion: workflow?.conversion || '', emailStatus: workflow?.emailStatus || '' } }
}
