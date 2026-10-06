import { accountingReport, reportNumber as n } from './report-accounting';
export async function profitReport(db: any, ids: string[], from: Date, to: Date, cleanup = false) {
  const financial = await accountingReport(db, ids, from, to);
  const docs = (
    await db.query(
      `SELECT b.id,b.invoice_number,b.created_at,b.company_id,s.signature->'costs' AS costs,
   (SELECT COALESCE(sum(CASE l.side WHEN 'CREDIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END),0) FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL AND a.account_type='INCOME') AS sales,
   (SELECT COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END),0) FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL AND a.account_type='COST_OF_GOODS_SOLD') AS cogs,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'variantId',e.variant_id,'name',e.name,'qty',e.qty,'rate',e.rate,'value',e.value,'tax',e.tax,'return',e.return,'category',COALESCE(c.name,'Other')) ORDER BY e.id) FROM entries e LEFT JOIN categories c ON c.id=e.category_id WHERE e.bill_id=b.id),'[]') AS entries
 FROM accountant_v2_erp_sources s JOIN bills b ON s.company_id=b.company_id AND s.source_key='bill:'||b.id
 JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id
 WHERE s.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND j.journal_date BETWEEN $2 AND $3 AND ($4 OR b.precedence IS NOT TRUE)
 ORDER BY b.created_at DESC,b.id`,
      [ids, from.toISOString(), to.toISOString(), cleanup]
    )
  ).rows;
  const categories = new Map<string, any>();
  const bills = docs.map((b: any) => {
    const sales = n(b.sales),
      cogs = n(b.cogs),
      profit = n(sales - cogs);
    let entries = b.entries.length
      ? b.entries
      : [{ name: 'Invoice adjustment', qty: 0, rate: 0, value: 0, category: 'Other' }];
    const weights = entries.map(
      (e: any) => (Number(e.value || 0) * (e.return ? -1 : 1)) / (1 + Number(e.tax || 0) / 100)
    );
    const total = weights.reduce((a: number, v: number) => a + v, 0);
    let allocatedSales = 0,
      allocatedCost = 0;
    entries = entries.map((e: any, i: number) => {
      const last = i === entries.length - 1;
      const value = last ? n(sales - allocatedSales) : n(total ? (sales * weights[i]) / total : 0);
      const cost = last
        ? n(cogs - allocatedCost)
        : n(
            Number(b.costs?.[e.id + ':' + (e.variantId || '')] || 0) *
              Number(e.qty || 0) *
              (e.return ? -1 : 1)
          );
      allocatedSales = n(allocatedSales + value);
      allocatedCost = n(allocatedCost + cost);
      const p = n(value - cost),
        category = categories.get(e.category) || { name: e.category, sales: 0, profit: 0 };
      category.sales = n(category.sales + value);
      category.profit = n(category.profit + p);
      categories.set(e.category, category);
      return {
        slNo: i + 1,
        name: e.name,
        qty: e.qty,
        rate: n(e.rate),
        value,
        cogs: cost,
        profit: p,
        marginPercent: value ? (p / value) * 100 : 0,
      };
    });
    return {
      id: b.id,
      companyId: b.company_id,
      invoiceNumber: b.invoice_number,
      billDate: b.created_at,
      billSales: sales,
      billCOGS: cogs,
      billProfit: profit,
      marginPercent: sales ? (profit / sales) * 100 : 0,
      entries,
    };
  });
  const categoryProfit = [...categories.values()].map((c) => ({
    ...c,
    marginPercent: c.sales ? (c.profit / c.sales) * 100 : 0,
  }));
  return {
    basis: 'posted-accounting',
    financial,
    summary: financial.pnl,
    bills,
    categoryProfit,
    categoryProfitChart: categoryProfit
      .filter((c) => c.profit > 0)
      .map((c) => ({ name: c.name, value: c.profit })),
  };
}
