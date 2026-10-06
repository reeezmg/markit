import { reportNumber as n } from './report-accounting';
// POS saves tax-inclusive entry values. Allocate invoice discounts/rounding before extracting tax.
export function summarizeOutwardBills(bills: any[]) {
  const rates = new Map<number, any>(),
    hsns = new Map<string, any>();
  let invoice = 0,
    tax = 0,
    taxable = 0,
    unallocated = 0;
  for (const b of bills) {
    const gross = n(b.grand_total);
    invoice = n(invoice + gross);
    const entries = b.entries || [];
    const base = entries.reduce(
      (s: number, e: any) => s + Number(e.value || 0) * (e.return ? -1 : 1),
      0
    );
    if (!base) {
      unallocated = n(unallocated + gross);
      continue;
    }
    const targetTax = n(
      (entries.reduce(
        (s: number, e: any) =>
          s +
          (Number(e.value || 0) * (e.return ? -1 : 1) * Number(e.tax || 0)) /
            (100 + Number(e.tax || 0)),
        0
      ) *
        gross) /
        base
    );
    let allocatedGross = 0,
      allocatedTax = 0;
    entries.forEach((e: any, i: number) => {
      const rate = Number(e.tax || 0),
        last = i === entries.length - 1;
      const amount = last
        ? n(gross - allocatedGross)
        : n((Number(e.value || 0) * (e.return ? -1 : 1) * gross) / base);
      const entryTax = last
        ? n(targetTax - allocatedTax)
        : n((((Number(e.value || 0) * (e.return ? -1 : 1) * rate) / (100 + rate)) * gross) / base);
      allocatedGross = n(allocatedGross + amount);
      allocatedTax = n(allocatedTax + entryTax);
      const value = n(amount - entryTax);
      const r = rates.get(rate) || { taxRate: rate, taxableValue: 0, totalTax: 0 };
      r.taxableValue = n(r.taxableValue + value);
      r.totalTax = n(r.totalTax + entryTax);
      rates.set(rate, r);
      const key = JSON.stringify([e.hsn, e.category, rate]),
        h = hsns.get(key) || {
          hsnCode: e.hsn || '',
          description: e.category || 'Other',
          uom: 'Nos',
          totalQty: 0,
          taxRate: rate,
          taxableValue: 0,
          totalTax: 0,
        };
      h.totalQty += Number(e.qty || 0) * (e.return ? -1 : 1);
      h.taxableValue = n(h.taxableValue + value);
      h.totalTax = n(h.totalTax + entryTax);
      hsns.set(key, h);
      tax = n(tax + entryTax);
      taxable = n(taxable + value);
    });
  }
  const split = (r: any) => ({
    ...r,
    cgst: n(r.totalTax / 2),
    sgst: n(r.totalTax - n(r.totalTax / 2)),
    igst: 0,
  });
  return {
    kpi: {
      billCount: bills.length,
      totalTaxableValue: taxable,
      totalTax: tax,
      totalInvoiceValue: invoice,
      unallocatedInvoiceValue: unallocated,
    },
    rateSummary: [...rates.values()].sort((a, b) => a.taxRate - b.taxRate).map(split),
    hsnSummary: [...hsns.values()].map(split),
  };
}
export async function outwardTaxReport(
  db: any,
  companyId: string,
  from: Date,
  to: Date,
  cleanup = false
) {
  const bills = (
    await db.query(
      `SELECT b.id,b.grand_total,COALESCE((SELECT jsonb_agg(jsonb_build_object('value',e.value,'tax',e.tax,'qty',e.qty,'return',e.return,'hsn',c.hsn,'category',c.name) ORDER BY e.id) FROM entries e LEFT JOIN categories c ON c.id=e.category_id WHERE e.bill_id=b.id),'[]') AS entries
 FROM bills b WHERE b.company_id=$1 AND NOT b.deleted AND NOT b.is_markit AND b.type='BILL' AND b.payment_status IN ('PAID','PENDING') AND b.created_at BETWEEN $2 AND $3 AND ($4 OR b.precedence IS NOT TRUE)`,
      [companyId, from.toISOString(), to.toISOString(), cleanup]
    )
  ).rows;
  return summarizeOutwardBills(bills);
}
