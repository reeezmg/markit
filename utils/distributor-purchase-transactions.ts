export function distributorPurchaseTransactions(orders: any[] = []) {
  return orders.filter(po => Number(po.totalAmount)>0).map(po => ({
    ...po, purchaseOrderId: po.id, createdAt: new Date(po.createdAt), type: 'PURCHASE',
    no: `PO-${po.purchaseOrderNo ?? po.id}`, debit: 0, credit: Number(po.totalAmount),
    amount: Number(po.totalAmount), pono: po.purchaseOrderNo, billno: po.billNo,
    class: 'bg-green-50 dark:bg-green-900/20',
  }));
}
