/** Credit only received quantities; loyalty is reversed proportionally, not paid as cash. */
export function planEcommerceReturn(sale: any, events: any[], request: any) {
  const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
  const previous = events.filter(e => e.action === 'RETURN');
  const priorQty = new Map<string, number>();
  for (const event of previous) for (const i of event.returnItems || []) priorQty.set(i.entryId, (priorQty.get(i.entryId) || 0) + i.qty);
  const seen = new Set();
  const items = request.items.map((i: any) => {
    const source = sale.items.find((s: any) => s.entryId === i.entryId);
    if (seen.has(i.entryId) || !source || source.returned || !source.itemId || !Number.isInteger(i.qty) || i.qty <= 0 || i.qty + (priorQty.get(i.entryId) || 0) > source.qty) throw new Error('Return quantities exceed the original sold items');
    seen.add(i.entryId); return { ...i, itemId: source.itemId, unitCost: source.unitCost };
  });
  if (!items.length) throw new Error('Select the items physically received back');
  const totalValue = sale.items.reduce((n: number, i: any) => n + Number(i.value || 0), 0);
  const totalQty = sale.items.reduce((n: number, i: any) => n + i.qty, 0);
  const weight = (includeNew: boolean) => sale.items.reduce((n: number, i: any) => {
    const qty = (priorQty.get(i.entryId) || 0) + (includeNew ? items.find((x: any) => x.entryId === i.entryId)?.qty || 0 : 0);
    return n + (totalValue ? Number(i.value || 0) * qty / i.qty / totalValue : qty / totalQty);
  }, 0);
  const credit = (amount: number) => (cents(amount * weight(true)) - cents(amount * weight(false))) / 100;
  const tax = credit(sale.tax);
  const merchandise = credit(sale.gross + (sale.redeemed || 0) - sale.tax - sale.delivery - sale.cod);
  const delivery = request.refundDelivery && !previous.some(e => e.refundDelivery) ? sale.delivery : 0;
  const cod = request.refundCod && !previous.some(e => e.refundCod) ? sale.cod : 0;
  const faceCredit = merchandise + tax + delivery + cod;
  const previousFace = previous.reduce((n: number, e: any) => n + Number(e.faceCredit || 0), 0);
  const faceTotal = sale.gross + (sale.redeemed || 0);
  const redeemed = faceTotal ? (cents((sale.redeemed || 0) * (previousFace + faceCredit) / faceTotal) - cents((sale.redeemed || 0) * previousFace / faceTotal)) / 100 : 0;
  const cost = cents(items.reduce((n: number, i: any) => n + i.qty * i.unitCost, 0)) / 100;
  const amount = cents(merchandise + tax + delivery + cod - redeemed) / 100;
  if (amount < 0) throw new Error('Return credit needs review because loyalty exceeds the refundable amount');
  const lines = [{ role: 'sales', amount: merchandise }, { role: 'outputTax', amount: tax }, { role: 'deliveryIncome', amount: delivery }, { role: 'codIncome', amount: cod },
    { role: 'loyaltyExpense', amount: -redeemed }, { role: 'receivable', amount: -amount }, { role: 'stock', amount: cost }, { role: 'cogs', amount: -cost }].filter(l => l.amount);
  const priorRedeemed = previous.reduce((n: number, e: any) => n + Number(e.redeemedReversed || 0), 0);
  const restoredPoints = Math.floor((cents(priorRedeemed) + cents(redeemed)) / 100) - Math.floor(cents(priorRedeemed) / 100);
  return { items, lines, metadata: { returnItems: items, refundDelivery: !!request.refundDelivery, refundCod: !!request.refundCod, credited: amount, faceCredit, redeemedReversed: redeemed, restoredPoints } };
}
