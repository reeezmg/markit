/** Allocation amounts count toward a PO, never the payment's full total. */
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
