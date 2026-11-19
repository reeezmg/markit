import { newQuoteLine, normalizeQuote, quoteMoney, type QuoteLine } from './erp-quote'

export function serviceChargeLine(charge: any, id: string): QuoteLine {
  return { ...newQuoteLine(id), name: charge.name, description: charge.description || '', unit: charge.unit || 'Service',
    rate: quoteMoney(Number(charge.rate || 0) * (1 + Number(charge.tax || 0) / 100)), tax: Number(charge.tax || 0) }
}

/** Old single-charge jobs remain billable; an explicit empty list means no charge. */
export function jobChargeLines(job: any): QuoteLine[] {
  if (Array.isArray(job?.details?.charges)) return job.details.charges
  return [serviceChargeLine({ name: job?.snapshot?.name || 'Service charge', rate: job?.charge || 0, tax: job?.tax || 0 }, 'service-charge')]
}

export function normalizeServiceLines(lines: unknown, stock: boolean): QuoteLine[] {
  if (!Array.isArray(lines) || lines.length > 200) throw Error('Enter up to 200 service items.')
  if (!lines.length) return []
  const items = normalizeQuote({ clientId: 'service-customer', quoteDate: '2026-01-01', status: 'DRAFT', discount: 0, discountType: 'amount', adjustment: 0, items: lines }).items
  if (items.some(line => stock ? !line.variantId : !!line.variantId || !!line.barcode || !!line.size))
    throw Error(stock ? 'Select products from the product catalog.' : 'Charges must be non-stock lines. Add products under repair parts.')
  return items
}

export function serviceInvoiceItems(job: any): QuoteLine[] {
  const charges = normalizeServiceLines(jobChargeLines(job), false)
  const parts = normalizeServiceLines(job.details?.parts || [], true)
  const items = [...charges, ...parts]
  // A free service still needs a descriptive line on its invoice.
  if (!items.length) items.push(serviceChargeLine({ name: job.snapshot?.name || 'Service completed' }, 'service-completed'))
  if (new Set(items.map(line => line.id)).size !== items.length) throw Error('Service item IDs must be unique.')
  return items
}

export function serviceJobTotal(job: any): number {
  return quoteMoney([...jobChargeLines(job), ...(job.details?.parts || [])].reduce((total, line) =>
    total + Number(line.quantity) * Number(line.rate) * (1 - Number(line.discount || 0) / 100), 0))
}
