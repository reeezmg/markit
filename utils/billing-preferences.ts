import { invoicePaymentTerms, paymentTermDueDate, type InvoicePaymentTerm } from './invoice-payment-terms'

export type BillingDocumentKind = 'invoice' | 'sale'
export type BillingPreferences = { version: 1; customerNotes: string; termsAndConditions: string; paymentTermId: string; pageSize: number; showSummary: boolean }
export const billingPageSizes = [3, 5, 10, 20, 30, 40]
export const emptyBillingPreferences = (kind: BillingDocumentKind = 'invoice'): BillingPreferences => ({ version: 1, customerNotes: '', termsAndConditions: '', paymentTermId: 'on-receipt', pageSize: kind === 'sale' ? 5 : 20, showSummary: true })
export function billingDocumentKind(value: unknown): BillingDocumentKind {
  if (value !== 'invoice' && value !== 'sale') throw Error('Select invoices or sales.')
  return value
}
export function normalizeBillingPreferences(value: any, kind: BillingDocumentKind): BillingPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw Error('Enter valid billing preferences.')
  const defaults = emptyBillingPreferences(kind), result = { ...defaults, ...value }
  for (const [key, label, limit] of [['customerNotes', 'Customer notes', 5000], ['termsAndConditions', 'Terms and conditions', 10000]] as const)
    if (typeof result[key] !== 'string' || result[key].length > limit) throw Error(`${label} must be text of at most ${limit} characters.`)
  if (!billingPageSizes.includes(result.pageSize)) throw Error('Select a valid number of rows per page.')
  if (typeof result.showSummary !== 'boolean') throw Error('Select a valid summary option.')
  if (typeof result.paymentTermId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(result.paymentTermId)) throw Error('Select a valid default payment term.')
  return { version: 1, customerNotes: result.customerNotes.trim(), termsAndConditions: result.termsAndConditions.trim(), paymentTermId: kind === 'invoice' ? result.paymentTermId : defaults.paymentTermId, pageSize: result.pageSize, showSummary: result.showSummary }
}
export type BillingDefaults = { invoice?: BillingPreferences; sale?: BillingPreferences; terms?: InvoicePaymentTerm[] }
export function newBillingDocumentValues(mode: string, day: string, defaults: BillingDefaults = {}) {
  const invoice = mode === 'invoice', preferences = defaults[invoice ? 'invoice' : 'sale'] || emptyBillingPreferences(invoice ? 'invoice' : 'sale')
  const term = [...invoicePaymentTerms, ...(defaults.terms || [])].find(term => term.id === preferences.paymentTermId) || invoicePaymentTerms.find(term => term.id === 'on-receipt')!
  return { notes: preferences.customerNotes, termsAndConditions: preferences.termsAndConditions,
    invoicePaymentTerms: invoice ? term.name : '', dueDate: invoice ? paymentTermDueDate(term, day) || day : '' }
}
