/** Allocation amounts count toward a PO, never the payment's full total. */
export function allocatePurchaseOrderPayment(amount: number, orders: { id: string; due: number }[]) {
  let remaining = Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
  return Object.fromEntries(orders.map(po => {
    const due = Number.isFinite(po.due) ? Math.max(0, Math.round(po.due * 100)) : 0;
    const allocated = Math.min(remaining, due);
    remaining -= allocated;
    return [po.id, allocated / 100];
  }));
}

export function purchaseOrderPayments(po: any) {
  return [
    ...(po?.distributorPayment || []),
    ...(po?.paymentAllocations || []).map((a: any) => ({ ...a.payment, amount: Number(a.amount), allocated: true })),
  ];
}

/** Payment method records how a PO began; outstanding due follows actual settlements. */
export function purchaseOrderDue(po: any, excludingPaymentId?: string) {
  if (po?.dueCleared) return 0;
  const paid = purchaseOrderPayments(po)
    .filter((payment: any) => !excludingPaymentId || payment.id !== excludingPaymentId)
    .reduce((sum: number, payment: any) => sum + Math.round(Number(payment.amount || 0) * 100), 0);
  return (Math.round(Number(po?.totalAmount || 0) * 100) - paid) / 100;
}
