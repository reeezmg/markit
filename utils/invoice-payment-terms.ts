export type InvoicePaymentTerm = { id: string; name: string; kind: 'days' | 'month-end' | 'next-month-end' | 'custom'; days?: number }
export type SavedPaymentTerm = InvoicePaymentTerm & { kind: 'days'; days: number }

export const invoicePaymentTerms: InvoicePaymentTerm[] = [
  { id: 'next-month-end', name: 'Due end of next month', kind: 'next-month-end' },
  { id: 'month-end', name: 'Due end of the month', kind: 'month-end' },
  { id: 'on-receipt', name: 'Due on Receipt', kind: 'days', days: 0 },
  ...[15, 30, 45, 60].map(days => ({ id: `net-${days}`, name: `Net ${days}`, kind: 'days' as const, days })),
]
export const customPaymentTerm: InvoicePaymentTerm = { id: 'custom', name: 'Custom', kind: 'custom' }

export function newPaymentTerm(value: any): { name: string; days: number } {
  if (typeof value?.name !== 'string' || !value.name.trim() || value.name.trim().length > 100) throw Error('Enter a term name of 1 to 100 characters.')
  if (typeof value.days !== 'number' || !Number.isInteger(value.days) || value.days < 0 || value.days > 3650) throw Error('Due after must be a whole number from 0 to 3650 days.')
  return { name: value.name.trim(), days: value.days }
}

export function savedPaymentTerms(value: any): SavedPaymentTerm[] {
  if (value == null) return []
  if (value.version !== 1 || !Array.isArray(value.terms) || value.terms.length > 100) throw Error('Saved payment terms are invalid.')
  const ids = new Set([...invoicePaymentTerms, customPaymentTerm].map(term => term.id)), names = new Set([...invoicePaymentTerms, customPaymentTerm].map(term => term.name.toLowerCase()))
  return value.terms.map((term: any) => {
    const input = newPaymentTerm(term)
    if (typeof term.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(term.id) || ids.has(term.id) || names.has(input.name.toLowerCase())) throw Error('Saved payment terms contain duplicates or invalid IDs.')
    ids.add(term.id); names.add(input.name.toLowerCase())
    return { id: term.id, ...input, kind: 'days' }
  })
}

export function paymentTermDueDate(term: InvoicePaymentTerm, invoiceDate: string): string | null {
  if (term.kind === 'custom') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return null
  const date = new Date(`${invoiceDate}T00:00:00Z`)
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== invoiceDate) return null
  if (term.kind === 'days') date.setUTCDate(date.getUTCDate() + (term.days || 0))
  else date.setUTCFullYear(date.getUTCFullYear(), date.getUTCMonth() + (term.kind === 'month-end' ? 1 : 2), 0)
  return date.toISOString().slice(0, 10)
}
