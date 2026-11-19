// History filters apply to snapshot events, not the bill's current updatedAt.
export function historyEventWhere(cleanup: boolean, range?: { start: Date; end: Date } | null) {
  const where: any = cleanup ? {} : { precedence: { not: true } }
  if (range) {
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const start = new Date(day(range.start)+'T00:00:00+05:30')
    const end = new Date(day(range.end)+'T00:00:00+05:30')
    end.setUTCDate(end.getUTCDate()+1)
    where.changedAt = { gte: start.toISOString(), lt: end.toISOString() }
  }
  return where
}

export function historyInvoiceWhere(value: unknown) {
  if (value == null || String(value).trim() === '') return {}
  const text = String(value).trim(), n = Number(text)
  return /^\d+$/.test(text) && Number.isInteger(n) && n <= 2147483647
    ? { invoiceNumber: n } : { id: { in: [] } }
}

export function historySnapshot(data: any = {}) {
  const number = (v: any, fallback = 0) => v == null || !Number.isFinite(Number(v)) ? fallback : Number(v)
  return {
    subtotal: number(data.subtotal), grandTotal: number(data.grand_total ?? data.grandTotal),
    discount: number(data.discount), returnAmt: number(data.return_amt ?? data.return_Amt ?? data.returnAmt),
    paymentMethod: data.payment_method ?? data.paymentMethod ?? 'Cash',
    splitPayments: (Array.isArray(data.split_payments ?? data.splitPayments) ? (data.split_payments ?? data.splitPayments) : [])
      .map((p: any) => ({method: String(p.method), amount: number(p.amount)})),
    entries: (Array.isArray(data.entries) ? data.entries : []).map((entry: any) => ({...entry,
      qty: number(entry.qty, 1), rate: number(entry.rate), discount: number(entry.discount), tax: number(entry.tax), value: number(entry.value),
    })),
  }
}
