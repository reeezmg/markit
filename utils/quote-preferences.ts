import { quoteLineAmount } from './erp-quote'
import { defaultQuoteDesign, normalizeQuoteDesign, type QuoteDesign } from './quote-design'

export const quoteTemplates = [
  { value: 'classic', label: 'Classic', description: 'Traditional quotation with a clear item table.' },
  { value: 'modern', label: 'Modern', description: 'Accent heading and a highlighted total.' },
  { value: 'compact', label: 'Compact', description: 'Smaller spacing for quotes with many items.' },
] as const
export type QuoteTemplate = typeof quoteTemplates[number]['value']
export type QuotePreferences = {
  documentDesign: QuoteDesign
  version: 1; defaultTemplate: QuoteTemplate; allowAcceptedEdits: boolean
  allowCustomerApproval: boolean; conversion: 'none' | 'draft' | 'email'
  hideZeroValueItems: boolean; termsAndConditions: string; customerNotes: string; invoiceDueDays: number
  retainCustomerNotes: boolean; retainTermsAndConditions: boolean
}
export const emptyQuotePreferences = (): QuotePreferences => ({
  documentDesign: defaultQuoteDesign(),
  version: 1, defaultTemplate: 'classic', allowAcceptedEdits: false, allowCustomerApproval: false,
  conversion: 'none', hideZeroValueItems: false, termsAndConditions: '',
  customerNotes: 'Thanks in advance for your business.', invoiceDueDays: 30,
  retainCustomerNotes: false, retainTermsAndConditions: false,
})
export const isQuoteTemplate = (value: unknown): value is QuoteTemplate => quoteTemplates.some(template => template.value === value)
export function normalizeQuotePreferences(value: any): QuotePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Enter valid quote preferences.')
  const defaults = emptyQuotePreferences()
  const result = { ...defaults, ...value }
  if (!isQuoteTemplate(result.defaultTemplate)) throw Error('Select a valid quote template.')
  for (const key of ['allowAcceptedEdits', 'allowCustomerApproval', 'hideZeroValueItems', 'retainCustomerNotes', 'retainTermsAndConditions'] as const)
    if (typeof result[key] !== 'boolean') throw Error('Select valid quote options.')
  if (!['none', 'draft', 'email'].includes(result.conversion)) throw Error('Select a valid invoice conversion option.')
  if (!Number.isInteger(result.invoiceDueDays) || result.invoiceDueDays < 0 || result.invoiceDueDays > 365) throw Error('Invoice due days must be between 0 and 365.')
  for (const [key, maximum] of [['termsAndConditions', 10000], ['customerNotes', 5000]] as const)
    if (typeof result[key] !== 'string' || result[key].length > maximum) throw Error(`${key === 'customerNotes' ? 'Customer notes' : 'Terms and conditions'} are too long.`)
  return { version: 1, defaultTemplate: 'classic', documentDesign: normalizeQuoteDesign(result.documentDesign), allowAcceptedEdits: result.allowAcceptedEdits,
    allowCustomerApproval: result.allowCustomerApproval, conversion: result.conversion,
    retainCustomerNotes: result.retainCustomerNotes, retainTermsAndConditions: result.retainTermsAndConditions,
    hideZeroValueItems: result.hideZeroValueItems, termsAndConditions: result.termsAndConditions.trim(),
    customerNotes: result.customerNotes.trim(), invoiceDueDays: result.invoiceDueDays }
}
export function visibleQuoteItems(quote: any) {
  const items = quote.items || []
  if (!quote.hideZeroValueItems || Number(quote.total) === 0) return items
  return items.filter((line: any) => Math.abs(Number(line.amount ?? quoteLineAmount(line))) >= 0.005)
}
