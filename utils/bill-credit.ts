export const receiptStatus = 'POS_CREDIT_RECEIPT'
export const reversedReceiptStatus = 'POS_CREDIT_REVERSED'

export function moneyCents(value: unknown) {
  if (!['number','string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) throw Error('Enter a valid amount')
  const n = Number(value), cents = Math.round(n * 100)
  if (!Number.isFinite(n) || !Number.isSafeInteger(cents) || Math.abs(n * 100 - cents) > 0.00001) throw Error('Amounts must have at most two decimal places')
  return cents
}

// Accept both SQL and generated-model shapes. Credit is the original obligation,
// not the current outstanding amount; receipts reduce it separately.
export function billCreditCents(bill: any) {
  const method = bill.payment_method ?? bill.paymentMethod
  const total = moneyCents(bill.grand_total ?? bill.grandTotal)
  if (method === 'Credit') return total
  if (method !== 'Split') return 0
  const parts = bill.split_payments ?? bill.splitPayments
  if (!Array.isArray(parts)) throw Error('Invalid split payments')
  if (parts.reduce((n, p) => n + moneyCents(p.amount), 0) !== total) throw Error('Split payments must equal the invoice total')
  return parts.filter(p => p.method === 'Credit').reduce((n, p) => n + moneyCents(p.amount), 0)
}

export function billOutstanding(bill: any) {
  const paid = (bill.payments || []).filter((p: any) => !p.deleted && p.status === receiptStatus)
    .reduce((n: number, p: any) => n + moneyCents(p.amount), 0)
  return Math.max(0, billCreditCents(bill) - paid) / 100
}

export function preserveCreditTender(before: any, after: any) {
  if (billCreditCents(before) <= 0) return
  const paidParts = (bill: any) => {
    const method = bill.payment_method ?? bill.paymentMethod
    const parts = method === 'Split' ? (bill.split_payments ?? bill.splitPayments) : [{method,amount:bill.grand_total ?? bill.grandTotal}]
    const totals: Record<string,number> = {}
    for (const part of parts || []) if (part.method !== 'Credit') totals[part.method] = (totals[part.method] || 0)+moneyCents(part.amount)
    return JSON.stringify(Object.entries(totals).filter(([,value])=>value!==0).sort(([a],[b])=>a.localeCompare(b)))
  }
  if (paidParts(before) !== paidParts(after)) throw Error('Record a dated receipt instead of changing the original paid portions')
}

export function receiptInput(body: any) {
  if (!body.billId || typeof body.billId !== 'string') throw Error('Select a bill')
  if (!['Cash', 'UPI', 'Card', 'Bank', 'Cheque'].includes(body.paymentMethod)) throw Error('Select a payment method')
  const amount = moneyCents(body.amount)
  if (amount <= 0) throw Error('Receipt amount must be positive')
  // A date-only input represents local midnight in the store's Indian timezone.
  const value = body.paymentDate
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) throw Error('Select a payment date')
  const calendar = new Date(value.slice(0,10)+'T00:00:00Z')
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10)!==value.slice(0,10)) throw Error('Invalid payment date')
  if (value.length !== 10 && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw Error('Use a payment date or timestamp with an explicit timezone')
  const date = new Date(value.length === 10 ? value + 'T00:00:00+05:30' : value)
  if (!Number.isFinite(date.getTime()) || (value.length === 10 && new Date(date.getTime() + 19800000).toISOString().slice(0, 10) !== value)) throw Error('Invalid payment date')
  if (date > new Date()) throw Error('Payment date cannot be in the future')
  if (typeof body.accountId !== 'string' || !body.accountId) throw Error('Select the receiving cash or bank account')
  const reference = String(body.reference || '').trim()
  if (reference.length > 100) throw Error('Reference must be at most 100 characters')
  return { billId: body.billId, amount: amount / 100, paymentMethod: body.paymentMethod, paymentDate: date.toISOString(), accountId: body.accountId, reference }
}
