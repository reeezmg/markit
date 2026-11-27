import { quoteLineAmount, quoteTotals } from './erp-quote'
import { quoteDocumentAddress, quoteDocumentImage } from './quote-document'

export type QuoteBindingKind = 'text' | 'image'
export interface QuoteBindingField { key: string; label: string; group: string; kind: QuoteBindingKind; row?: boolean }
export const quoteBindingFields: QuoteBindingField[] = [
  ...[['companyName', 'Company name'], ['companyAddress', 'Address'], ['companyPhone', 'Phone'], ['companyEmail', 'Email'], ['gstin', 'GST number']].map(([key, label]) => ({ key, label, group: 'Company', kind: 'text' as const })),
  { key: 'companyLogo', label: 'Company logo', group: 'Company', kind: 'image' },
  ...[['clientName', 'Customer name'], ['clientPhone', 'Phone'], ['clientAddress', 'Address'], ['referenceNumber', 'Customer reference']].map(([key, label]) => ({ key, label, group: 'Customer', kind: 'text' as const })),
  ...[['quoteNumber', 'Quote number'], ['quoteDate', 'Quote date'], ['expiryDate', 'Valid until'], ['salesperson', 'Prepared by'], ['subject', 'Subject'], ['paymentTerms', 'Payment terms'], ['deliveryEstimate', 'Delivery estimate'], ['notes', 'Customer notes'], ['terms', 'Terms and conditions']].map(([key, label]) => ({ key, label, group: 'Document', kind: 'text' as const })),
  ...[['total-subtotal', 'Subtotal'], ['total-discount', 'Discount'], ['total-adjustment', 'Adjustment'], ['total-tax', 'Tax included'], ['total', 'Quote total']].map(([key, label]) => ({ key, label, group: 'Totals', kind: 'text' as const })),
  { key: 'productImage', label: 'Product image', group: 'Item row', kind: 'image', row: true },
  ...[['itemName', 'Product name'], ['itemDescription', 'Description'], ['itemSize', 'Size'], ['row-number', 'Row number'], ['row-quantity', 'Quantity / unit'], ['row-rate', 'Unit price'], ['row-discount', 'Discount %'], ['row-tax', 'Tax %'], ['row-amount', 'Line amount']].map(([key, label]) => ({ key, label, group: 'Item row', kind: 'text' as const, row: true })),
  // Existing templates use these aliases; retain them when opening saved designs.
  { key: 'total-grand', label: 'Grand total', group: 'Totals', kind: 'text' },
]
export function quoteBindingOptions(kind: QuoteBindingKind, row = false) {
  return quoteBindingFields.filter(field => field.kind === kind && (!field.row || row))
}
export function quoteBindingLabel(field: QuoteBindingField, salesOrder = false) {
  if (!salesOrder) return field.label
  return ({ quoteNumber: 'Order number', quoteDate: 'Order date', expiryDate: 'Expected shipment date', deliveryEstimate: 'Delivery method', total: 'Order total' } as Record<string, string>)[field.key] || field.label
}

/** Only data already supplied to the document renderer is exposed to design layers. */
export function quoteDocumentBindingValues(quote: any, company: any, professional = false): Record<string, string> {
  const totals = quoteTotals(quote)
  const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: company.currency || 'INR' }).format(value || 0)
  const date = (value: string) => {
    if (!professional || !/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || ''
    const parsed = new Date(value + 'T00:00:00Z')
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
  }
  return {
    companyName: company.companyName || company.name || '', companyPhone: company.companyPhone || company.phone || '',
    companyAddress: quoteDocumentAddress(company.address), companyEmail: company.companyEmail || '', gstin: company.gstin || '', companyLogo: quoteDocumentImage(company.logo),
    quoteNumber: quote.quoteNumber || '', quoteDate: date(quote.quoteDate), expiryDate: date(quote.expiryDate),
    clientName: quote.clientName || '', clientPhone: quote.clientPhone || '', clientAddress: quoteDocumentAddress(quote.clientAddress),
    referenceNumber: quote.referenceNumber || '', salesperson: quote.salesperson || '', subject: quote.subject || '',
    paymentTerms: quote.paymentTerms || '', deliveryEstimate: quote.deliveryEstimate || '', notes: quote.notes || '', terms: quote.termsAndConditions || '',
    total: money(quote.total ?? totals.total), 'total-grand': money(quote.total ?? totals.total), 'total-subtotal': money(quote.subTotal ?? totals.subTotal),
    'total-discount': '− ' + money(totals.discountAmount), 'total-adjustment': money(quote.adjustment), 'total-tax': money(totals.includedTax),
  }
}
export function quoteItemBindingValues(line: any, index: number, currency = 'INR'): Record<string, string> {
  const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value || 0)
  return { productImage: quoteDocumentImage(line.image), itemName: line.name || '', itemDescription: line.description || '', itemSize: line.size || '',
    'row-number': String(index + 1), 'row-quantity': `${line.quantity ?? 0} ${line.unit || ''}`.trim(), 'row-rate': money(line.rate),
    'row-discount': `${line.discount || 0}%`, 'row-tax': `${line.tax || 0}%`, 'row-amount': money(line.amount ?? quoteLineAmount(line)) }
}

/** Conditions use original numbers, independently of currency and presentation formatting. */
export function quoteDocumentRuleValues(quote: any, company: any): Record<string, unknown> {
  const totals = quoteTotals(quote)
  return { ...quoteDocumentBindingValues(quote, company), total: quote.total ?? totals.total, 'total-grand': quote.total ?? totals.total,
    'total-subtotal': quote.subTotal ?? totals.subTotal, 'total-discount': totals.discountAmount, 'total-adjustment': quote.adjustment ?? 0, 'total-tax': totals.includedTax }
}
export function quoteItemRuleValues(line: any, index: number): Record<string, unknown> {
  return {...quoteItemBindingValues(line,index), 'row-number':index+1, 'row-quantity':line.quantity ?? 0, 'row-rate':line.rate ?? 0,
    'row-discount':line.discount ?? 0, 'row-tax':line.tax ?? 0, 'row-amount':line.amount ?? quoteLineAmount(line)}
}
