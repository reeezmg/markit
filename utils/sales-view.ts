export const salesViews = [
  { value: 'all', label: 'All sales' },
  { value: 'paynow', label: 'Pay now' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'unpaid', label: 'Unpaid / overdue' },
] as const
export type SalesView = typeof salesViews[number]['value']
export function salesView(value: unknown): SalesView {
  return salesViews.some(view => view.value === value) ? value as SalesView : 'all'
}
export const salesInvoiceView = (value: SalesView) => value === 'invoices' || value === 'unpaid'
export function salesInvoiceRedirect(query: Record<string, any>) {
  const { view: _view, ...rest } = query
  return { path: '/erp/sales', query: { ...rest, view: 'invoices' } }
}
export function salesExportColumns(invoice: boolean) {
  return invoice ? [
    {key:'invoiceNumber',label:'Invoice number'}, {key:'date',label:'Date'}, {key:'customer',label:'Customer'},
    {key:'dueDate',label:'Due date'}, {key:'grandTotal',label:'Total',numeric:true},
    {key:'amountReceived',label:'Received',numeric:true}, {key:'balanceDue',label:'Balance',numeric:true},
    {key:'paymentStatus',label:'Payment status'}, {key:'companyName',label:'Store'},
  ] : [
    {key:'invoiceNumber',label:'Invoice number'}, {key:'date',label:'Date'}, {key:'subtotal',label:'Subtotal',numeric:true},
    {key:'discount',label:'Discount',numeric:true}, {key:'grandTotal',label:'Grand total',numeric:true},
    {key:'taxCollected',label:'Total tax collected',numeric:true}, {key:'payment',label:'Payment'}, {key:'companyName',label:'Store'},
  ]
}
