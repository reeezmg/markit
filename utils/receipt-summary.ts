const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function receiptSummary(data: any) {
  const raw = String(data.discount ?? '0');
  const discount = raw.startsWith('+') ? -Math.abs(numeric(raw)) : numeric(raw) < 0 ? Math.abs(numeric(raw)) : numeric(data.ttvalue ?? data.subtotal) * numeric(raw) / 100;
  const discountText = raw.startsWith('+') ? `+${Math.abs(numeric(raw)).toFixed(2)}` : numeric(raw) < 0 ? `-${Math.abs(numeric(raw)).toFixed(2)}` : discount.toFixed(2);
  const savings = Math.max(0, numeric(data.tdiscount) + discount + numeric(data.couponValue) + numeric(data.redeemedPoints));
  const groups = new Map<number, number>();
  for (const entry of data.entries || []) {
    const rate = numeric(entry.tax);
    if (rate > 0) groups.set(rate, (groups.get(rate) || 0) + numeric(entry.tvalue));
  }
  const tax = [...groups].sort(([a], [b]) => a - b).map(([rate, value]) => {
    const total = data.isTaxIncluded ? value - value / (1 + rate / 100) : value * rate / 100;
    return { rate, sgst: total / 2, cgst: total / 2, total };
  });
  return { discountText, savings, tax };
}
