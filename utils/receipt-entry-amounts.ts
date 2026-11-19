const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

/** Receipt rows use the same return signs as the billing total. */
export function receiptEntryAmounts(entry: any) {
  const sign = entry.return ? -1 : 1
  const qty = sign * numeric(entry.qty ?? 1)
  return { qty, value: qty * numeric(entry.rate), tvalue: sign * numeric(entry.value), return: Boolean(entry.return) }
}

export function receiptEntryTotals(entries: any[]) {
  return entries.reduce((total, entry) => {
    const amounts = receiptEntryAmounts(entry)
    const discount = numeric(entry.discount)
    const deduction = discount < 0 ? Math.abs(discount) : numeric(entry.rate) * discount / 100
    total.tqty += amounts.qty
    total.tvalue += amounts.value
    total.ttvalue += amounts.tvalue
    total.tdiscount += deduction * amounts.qty
    return total
  }, { tqty: 0, tvalue: 0, ttvalue: 0, tdiscount: 0 })
}
