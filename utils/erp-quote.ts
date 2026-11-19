import { isQuoteTemplate, type QuoteTemplate } from './quote-preferences'
export const quoteStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const
export type QuoteStatus = typeof quoteStatuses[number]
export type QuoteLine = {
  id: string; variantId: string; name: string; description: string; barcode: string; size: string
  unit: string; quantity: number; rate: number; discount: number; tax: number
}
export type QuoteInput = {
  clientId: string; quoteDate: string; expiryDate: string; referenceNumber: string; subject: string
  salesperson: string; status: QuoteStatus; notes: string; termsAndConditions: string
  paymentTerms: string; deliveryEstimate: string; discount: number; discountType: 'amount' | 'percent'
  adjustment: number; items: QuoteLine[]
  pdfTemplate?: QuoteTemplate; hideZeroValueItems?: boolean
}
export const quoteMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export function quoteLineAmount(line: Pick<QuoteLine, 'quantity' | 'rate' | 'discount'>) {
  return quoteMoney(Number(line.quantity) * Number(line.rate) * (1 - Number(line.discount) / 100))
}
/** Rates include tax, matching POS entry. Document discount reduces included tax proportionally. */
export function quoteTotals(input: Pick<QuoteInput, 'items' | 'discount' | 'discountType' | 'adjustment'>) {
  const subTotal = quoteMoney(input.items.reduce((sum, line) => sum + quoteLineAmount(line), 0))
  const discountAmount = input.discountType === 'percent' ? quoteMoney(subTotal * Number(input.discount) / 100) : quoteMoney(Number(input.discount))
  const factor = subTotal > 0 ? Math.max(0, subTotal - discountAmount) / subTotal : 0
  const includedTax = quoteMoney(input.items.reduce((sum, line) => {
    const tax = Number(line.tax)
    return sum + quoteLineAmount(line) * factor * tax / (100 + tax)
  }, 0))
  return { subTotal, discountAmount, includedTax, total: quoteMoney(subTotal - discountAmount + Number(input.adjustment)) }
}

export function newQuoteLine(id: string): QuoteLine {
  return { id, variantId: '', name: '', description: '', barcode: '', size: '', unit: '', quantity: 1, rate: 0, discount: 0, tax: 0 }
}

export function normalizeQuote(value: unknown): QuoteInput {
  const fail = (message: string): never => { throw new Error(message) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Enter the quote details.')
  const body = value as Record<string, any>
  function text(value: unknown, label: string, max = 500, required = false) {
    if (value !== undefined && value !== null && typeof value !== 'string') fail(`${label} must be text.`)
    const result = String(value ?? '').trim()
    if (required && !result) fail(`${label} is required.`)
    if (result.length > max) fail(`${label} is too long (maximum ${max} characters).`)
    return result
  }
  function number(value: unknown, label: string, min = 0, max = 999999999, decimals = 2) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) > 0.00001) {
      fail(`${label} must be between ${min} and ${max}, with at most ${decimals} decimal places.`)
    }
    return value as number
  }
  function date(value: unknown, label: string, optional = false) {
    const result = text(value, label, 10, !optional)
    if (!result && optional) return ''
    const parsed = new Date(result + 'T00:00:00.000Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== result || result < '2000-01-01' || result > '2100-12-31') fail(`Enter a valid ${label.toLowerCase()}.`)
    return result
  }
  const quoteDate = date(body.quoteDate, 'Quote date')
  const expiryDate = date(body.expiryDate, 'Valid until', true)
  if (expiryDate && expiryDate < quoteDate) fail('Valid until must be on or after the quote date.')
  if (!quoteStatuses.includes(body.status)) fail('Select a valid quote status.')
  if (!['amount', 'percent'].includes(body.discountType)) fail('Select a valid discount type.')
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) fail('Add between 1 and 200 quote items.')
  const seen = new Set<string>()
  const items = body.items.map((line: any, index: number): QuoteLine => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) fail('Enter a valid quote item.')
    const label = `Item ${index + 1}`
    const id = text(line.id, `${label} ID`, 128, true)
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) fail('Quote item IDs must be unique.')
    seen.add(id)
    return { id, variantId: text(line.variantId, 'Product', 128), name: text(line.name, `${label} name`, 500, true),
      description: text(line.description, `${label} description`, 2000), barcode: text(line.barcode, 'Barcode', 128),
      size: text(line.size, 'Size', 100), unit: text(line.unit, 'Unit', 50),
      quantity: number(line.quantity, `${label} quantity`, 0.001, 999999, 3), rate: number(line.rate, `${label} rate`),
      discount: number(line.discount, `${label} discount`, 0, 100), tax: number(line.tax, `${label} tax`, 0, 100) }
  })
  const result: QuoteInput = {
    clientId: text(body.clientId, 'Customer', 128, true), quoteDate, expiryDate,
    referenceNumber: text(body.referenceNumber, 'Customer reference', 200), subject: text(body.subject, 'Subject', 500),
    salesperson: text(body.salesperson, 'Prepared by', 200), status: body.status,
    notes: text(body.notes, 'Notes', 5000), termsAndConditions: text(body.termsAndConditions, 'Terms and conditions', 10000),
    paymentTerms: text(body.paymentTerms, 'Payment terms', 1000), deliveryEstimate: text(body.deliveryEstimate, 'Delivery estimate', 1000),
    discount: number(body.discount, 'Quote discount', 0, body.discountType === 'percent' ? 100 : 999999999),
    discountType: body.discountType, adjustment: number(body.adjustment, 'Adjustment', -999999999), items,
  }
  const totals = quoteTotals(result)
  if (body.pdfTemplate !== undefined) {
    if (!isQuoteTemplate(body.pdfTemplate)) fail('Select a valid quote template.')
    result.pdfTemplate = body.pdfTemplate
  }
  if (body.hideZeroValueItems !== undefined) {
    if (typeof body.hideZeroValueItems !== 'boolean') fail('Select a valid item visibility option.')
    result.hideZeroValueItems = body.hideZeroValueItems
  }
  if (totals.discountAmount > totals.subTotal) fail('Quote discount cannot exceed the subtotal.')
  if (!Number.isFinite(totals.total) || totals.total < 0 || totals.total > 999999999) fail('Quote total must be between 0 and 999999999.')
  return result
}
