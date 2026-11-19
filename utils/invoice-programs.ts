import { normalizeQuote, quoteTotals, type QuoteInput } from './erp-quote'

export const invoiceToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function invoiceDay(value: unknown, label = 'Date'): string {
  const text = typeof value === 'string' ? value : ''
  const date = new Date(text + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== text || text < '2000-01-01' || text > '2100-12-31') throw Error(`Enter a valid ${label.toLowerCase()}.`)
  return text
}
export function invoiceText(value: unknown, label: string, max = 500, required = false) {
  if (value != null && typeof value !== 'string') throw Error(`${label} must be text.`)
  const result = String(value ?? '').trim()
  if ((required && !result) || result.length > max) throw Error(`Enter ${label.toLowerCase()} (maximum ${max} characters).`)
  return result
}
export function invoiceCents(value: unknown, label = 'Amount') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 999999999 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw Error(`${label} must be positive, with at most two decimal places.`)
  return Math.round(value * 100)
}
export function addInvoiceDays(day: string, days: number) {
  const date = new Date(day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export type RecurringInput = { name: string; startDate: string; endDate: string; frequency: string; interval: number; generationMode: string; dueDays: number; template: QuoteInput }
export function recurringInput(body: any): RecurringInput {
  if (!body || typeof body !== 'object') throw Error('Enter a recurring profile.')
  const startDate = invoiceDay(body.startDate, 'Start date'), endDate = body.endDate ? invoiceDay(body.endDate, 'End date') : ''
  if (endDate && endDate < startDate) throw Error('End date must be on or after start date.')
  if (!['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(body.frequency)) throw Error('Select a frequency.')
  if (!Number.isInteger(body.interval) || body.interval < 1 || body.interval > 365) throw Error('Repeat interval must be between 1 and 365.')
  if (!Number.isInteger(body.dueDays) || body.dueDays < 0 || body.dueDays > 3650) throw Error('Due days must be between 0 and 3650.')
  if (!['DRAFT', 'ISSUE'].includes(body.generationMode)) throw Error('Select draft or automatic issue.')
  const template = normalizeQuote({ ...body.template, quoteDate: startDate, expiryDate: '', status: 'DRAFT' })
  if (quoteTotals(template).total <= 0) throw Error('Invoice total must be positive.')
  return { name: invoiceText(body.name, 'Profile name', 200, true), startDate, endDate, frequency: body.frequency,
    interval: body.interval, generationMode: body.generationMode, dueDays: body.dueDays, template }
}
/** Always calculate from the original anchor: Jan 31 -> Feb 28 -> Mar 31. */
export function nextRecurringDate(anchor: string, frequency: string, interval: number, after: string, inclusive = false) {
  const start = new Date(anchor + 'T00:00:00Z'), limit = new Date(after + 'T00:00:00Z')
  const at = (n: number) => {
    if (frequency === 'DAY' || frequency === 'WEEK') return addInvoiceDays(anchor, n * interval * (frequency === 'WEEK' ? 7 : 1))
    const months = n * interval * (frequency === 'YEAR' ? 12 : 1)
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1))
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(start.getUTCDate(), last))
    return date.toISOString().slice(0, 10)
  }
  const elapsed = Math.max(0, +limit - +start)
  let n = frequency === 'DAY' || frequency === 'WEEK' ? Math.floor(elapsed / 86400000 / interval / (frequency === 'WEEK' ? 7 : 1))
    : Math.max(0, Math.floor(((limit.getUTCFullYear() - start.getUTCFullYear()) * 12 + limit.getUTCMonth() - start.getUTCMonth()) / interval / (frequency === 'YEAR' ? 12 : 1)))
  while (at(n) < after || (!inclusive && at(n) === after)) n++
  return at(n)
}
export function retainerInput(body: any) {
  if (!body || typeof body !== 'object') throw Error('Enter a retainer invoice.')
  return { clientId: invoiceText(body.clientId, 'Customer', 128, true), retainerDate: invoiceDay(body.retainerDate, 'Retainer date'),
    description: invoiceText(body.description, 'Description', 2000, true), reference: invoiceText(body.reference, 'Reference', 200),
    notes: invoiceText(body.notes, 'Customer notes', 5000), termsAndConditions: invoiceText(body.termsAndConditions, 'Terms and conditions', 10000),
    amount: invoiceCents(body.amount) / 100, liabilityAccountId: invoiceText(body.liabilityAccountId, 'Unearned revenue account', 128, true) }
}
export function retainerBalances(events: any[]) {
  let collected = 0, applied = 0, refunded = 0
  for (const event of events) {
    const cents = Math.round(Number(event.amount) * 100)
    if (event.kind === 'COLLECTION') collected += cents
    if (event.kind === 'APPLY') applied += cents
    if (event.kind === 'UNAPPLY') applied -= cents
    if (event.kind === 'REFUND') refunded += cents
  }
  return { collected: collected / 100, applied: applied / 100, refunded: refunded / 100, available: (collected - applied - refunded) / 100 }
}
export function retainerStatus(row: any) {
  if (row.status === 'VOID') return 'Void'
  if (Number(row.refunded) > 0 && Number(row.available) === 0 && Number(row.applied) === 0) return 'Refunded'
  if (Number(row.applied) > 0) return Number(row.available) > 0 ? 'Partially applied' : 'Applied'
  if (Number(row.collected) >= Number(row.amount)) return 'Paid'
  if (Number(row.collected) > 0) return 'Partially paid'
  return row.status === 'DRAFT' ? 'Draft' : 'Sent'
}
