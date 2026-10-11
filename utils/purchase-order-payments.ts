/** Allocation amounts count toward a PO, never the payment's full total. */
export function purchaseOrderPayments(po: any) {
  return [
    ...(po?.distributorPayment || []),
    ...(po?.paymentAllocations || []).map((a: any) => ({ ...a.payment, amount: Number(a.amount), allocated: true })),
  ];
}
