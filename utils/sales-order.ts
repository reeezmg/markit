import { normalizeQuote, type QuoteInput } from './erp-quote'
export const salesOrderStatuses = ['DRAFT', 'CONFIRMED', 'CLOSED', 'CANCELLED'] as const
export type SalesOrderStatus = typeof salesOrderStatuses[number]
export function normalizeSalesOrder(body: any) {
  if (!salesOrderStatuses.includes(body?.status)) throw Error('Select a valid sales order status.')
  const input = normalizeQuote({ ...body, status: 'DRAFT', quoteDate: body.orderDate, expiryDate: body.expectedShipmentDate,
    deliveryEstimate: body.deliveryMethod })
  return { ...input, status: body.status as SalesOrderStatus }
}
export function salesOrderForEditor(order: any) {
  return { ...order, quoteNumber: order.orderNumber, quoteDate: order.orderDate, expiryDate: order.expectedShipmentDate, deliveryEstimate: order.deliveryMethod }
}
export function salesOrderFromEditor(input: QuoteInput) {
  const { quoteDate, expiryDate, deliveryEstimate, pdfTemplate, ...rest } = input
  return { ...rest, orderDate: quoteDate, expectedShipmentDate: expiryDate, deliveryMethod: deliveryEstimate }
}
