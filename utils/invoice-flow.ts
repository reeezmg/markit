import { billOutstanding, moneyCents } from './bill-credit'
import { documentNoteLines } from './document-notes'

export function isInvoice(bill: any) {
  return bill?.billingMode === 'invoice' || Boolean((bill?.invoiceCode ?? bill?.invoice_code) &&
    (bill?.type == null || bill.type === 'BILL') && !(bill?.isMarkit ?? bill?.is_markit))
}
export function invoiceDetails(value: any, invoiceDate: string) {
  const date = value?.dueDate
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(+new Date(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw Error('Select a valid invoice due date.')
  const issued = new Date(invoiceDate)
  if (!Number.isFinite(+issued)) throw Error('Select a valid invoice date.')
  const day = new Date(issued.getTime() + 19800000).toISOString().slice(0,10)
  if (date < day) throw Error('Due date cannot precede the invoice date.')
  const text = (value: unknown, label: string, limit: number) => {
    if (value != null && typeof value !== 'string') throw Error(`${label} must be text.`)
    const result = String(value || '').trim()
    if (result.length > limit) throw Error(`${label} is too long (maximum ${limit} characters).`)
    return result
  }
  return { dueDate: date, invoicePaymentTerms: text(value.invoicePaymentTerms, 'Payment terms', 2000),
    subject: text(value.subject, 'Subject', 500) }
}
export function invoiceBalance(bill: any) {
  const total = Number(bill.grandTotal ?? bill.grand_total ?? 0)
  const credit = bill.paymentMethod === 'Credit' || bill.payment_method === 'Credit' || bill.paymentMethod === 'Split' || bill.payment_method === 'Split'
  const outstanding = credit ? billOutstanding(bill) : (bill.paymentStatus ?? bill.payment_status) === 'PAID' ? 0 : total
  const received = Math.max(0, (moneyCents(total) - moneyCents(outstanding)) / 100)
  return { amountReceived: received, balanceDue: outstanding,
    invoicePaymentStatus: outstanding <= 0 ? 'Paid' : received > 0 ? 'Partially paid' : 'Unpaid' }
}
/** Shared footer for screen preview, custom receipt designs, PDF and printer output. */
export function invoiceDocumentLines(data: any): string[] {
  if (!isInvoice(data)) return []
  const amount = (value: any) => Number(value || 0).toFixed(2)
  return [
    `INVOICE ${data.invoiceCode || data.invoiceNumber || ''}`,
    `Status: ${data.invoicePaymentStatus || 'Unpaid'}`,
    `Amount received: ${amount(data.amountReceived)}`,
    `Balance due: ${amount(data.balanceDue ?? data.grandTotal)}`,
    data.dueDate ? `Due date: ${String(data.dueDate).slice(0,10)}` : '',
    data.subject ? `Subject: ${data.subject}` : '',
    data.invoicePaymentTerms ? `Payment terms: ${data.invoicePaymentTerms}` : '',
    Number(data.balanceDue ?? data.grandTotal) > 0 ? 'Please include the invoice number with your payment.' : '',
    data.upiId && Number(data.balanceDue ?? data.grandTotal) > 0 ? `Pay via UPI: ${data.upiId}` : '',
  ].filter(Boolean)
}

export function billDocumentLines(data: any): string[] {
  return [...invoiceDocumentLines(data), ...documentNoteLines(data)]
}
