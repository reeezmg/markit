import nodemailer from 'nodemailer'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { readQuote } from './erp-quotes'
import { patchQuoteWorkflow } from './quote-workflow'

export async function sendQuoteInvoiceEmail(message: { to: string; invoice: any; quote: any; company: any }) {
  const host = process.env.SMTP_HOST, port = Number(process.env.SMTP_PORT), user = process.env.SMTP_USER, pass = process.env.SMTP_PASS
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass) throw Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS before emailing invoices.')
  const { quote, company, invoice } = message
  const money = (value: any) => Number(value || 0).toFixed(2)
  const doc = new jsPDF()
  doc.setFontSize(18); doc.text('INVOICE ' + invoice.invoice_code, 14, 20)
  doc.setFontSize(10); doc.text(String(company.name || ''), 14, 30)
  doc.text(`Customer: ${quote.clientName || ''}`, 14, 38)
  doc.text(`Reference: ${quote.quoteNumber} | Due: ${String(invoice.due_date || '').slice(0, 10)}`, 14, 46)
  const entries = invoice.entries || quote.items.map((line: any) => ({ name: line.name, qty: line.quantity, rate: line.rate, discount: line.discount, value: line.amount, tax: line.tax }))
  autoTable(doc, { startY: 52, head: [['Item', 'Qty', 'Rate', 'Disc. %', 'Line total']],
    body: entries.map((line: any) => [line.name, Number(line.qty) === 0 ? '—' : String(line.qty), Number(line.qty) === 0 ? '—' : money(line.rate), money(line.discount), money(Number(line.value) * (line.return ? -1 : 1))]), styles: { fontSize: 9 } })
  let endY = (doc as any).lastAutoTable.finalY + 12
  if (endY > 240) { doc.addPage(); endY = 20 }
  doc.text(`Invoice discount: ${invoice.discount_type === 'percentage' ? Number(invoice.discount || 0) + '%' : money(Math.abs(Number(invoice.discount || 0)))}`, 14, endY)
  const received = Number(invoice.amount_received || 0), balance = Math.max(0, Number(invoice.grand_total) - received)
  const base = entries.reduce((sum: number, line: any) => sum + Number(line.value || 0) * (line.return ? -1 : 1), 0)
  const tax = entries.reduce((sum: number, line: any) => sum + Number(line.value || 0) * (line.return ? -1 : 1) * Number(line.tax || 0) / (100 + Number(line.tax || 0)), 0)
  doc.text(`Tax included: ${money(base ? tax * Number(invoice.grand_total) / base : tax)}`, 14, endY + 8)
  endY += 16
  doc.text(`Invoice total: ${company.currency || 'INR'} ${money(invoice.grand_total)}`, 14, endY)
  doc.text(`Amount received: ${money(received)} | Balance due: ${money(balance)}`, 14, endY + 8)
  const sections = [['Payment terms', invoice.invoice_payment_terms], ['Customer notes', invoice.notes], ['Terms and conditions', invoice.termsAndConditions]].filter(([, value]) => value)
  if (sections.length) autoTable(doc, { startY: endY + 16, body: sections, styles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 35 } } })
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 })
  await transport.sendMail({ from: user, to: message.to, messageId: `<quote-invoice-${invoice.id}@markit.local>`,
    subject: `${company.name}: Invoice ${invoice.invoice_code}`,
    text: `Hello ${quote.clientName || ''},\n\nYour quote ${quote.quoteNumber} has been accepted. Your invoice ${invoice.invoice_code} is attached.\nTotal: ${company.currency || 'INR'} ${money(invoice.grand_total)}\nReceived: ${money(received)}\nBalance due: ${money(balance)}\nDue: ${String(invoice.due_date || '').slice(0, 10)}\n${invoice.invoice_payment_terms || ''}\n\n${invoice.notes || ''}`,
    attachments: [{ filename: `${invoice.invoice_code}.pdf`, content: Buffer.from(doc.output('arraybuffer')), contentType: 'application/pdf' }] })
}

/** Run only after the invoice transaction commits. SMTP failures never undo acceptance or issue another invoice. */
export async function deliverQuoteInvoiceEmail(pool: any, companyId: string, quoteId: string, sender = sendQuoteInvoiceEmail) {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query('SELECT id FROM quotes WHERE id=$1 AND company_id=$2 FOR UPDATE', [quoteId, companyId])
    const quote = await readQuote(db, companyId, quoteId), workflow = { ...quote.workflow }
    if (!workflow.invoiceId || workflow.emailStatus !== 'Pending') { await db.query('COMMIT'); return workflow }
    const invoice = (await db.query('SELECT b.id,b.client_id,b.invoice_code,b.grand_total,b.discount,b.discount_type,b.notes,b.terms_and_conditions AS "termsAndConditions",to_char(b.due_date,\'YYYY-MM-DD\') AS due_date,b.invoice_payment_terms FROM bills b WHERE b.id=$1 AND b.company_id=$2 AND b.deleted=false FOR SHARE OF b', [workflow.invoiceId, companyId])).rows[0]
    if (invoice) {
      invoice.entries = (await db.query('SELECT name,qty,rate,discount,value,tax,return FROM entries WHERE bill_id=$1 AND company_id=$2 ORDER BY id', [invoice.id, companyId])).rows
      invoice.amount_received = (await db.query("SELECT COALESCE(sum(amount),0) AS received FROM payments WHERE bill_id=$1 AND company_id=$2 AND deleted=false AND status='POS_CREDIT_RECEIPT'", [invoice.id, companyId])).rows[0]?.received || 0
    }
    const customer = (await db.query('SELECT c.email FROM clients c JOIN company_clients cc ON cc.client_id=c.id WHERE c.id=$1 AND cc.company_id=$2 AND c.deleted=false', [invoice?.client_id, companyId])).rows[0]
    const company = (await db.query('SELECT name,currency FROM companies WHERE id=$1', [companyId])).rows[0]
    try {
      if (!invoice) throw Error('The linked invoice is unavailable.')
      if (!customer?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw Error('Add a valid customer email, then retry invoice email.')
      await sender({ to: customer.email, invoice, quote: workflow.invoiceQuote || quote, company: { ...company, currency: workflow.invoiceCurrency || company.currency } })
      workflow.emailStatus = 'Sent'; workflow.emailError = ''; workflow.emailedAt = new Date().toISOString()
    } catch (error: any) { workflow.emailStatus = 'Failed'; workflow.emailError = error.message || 'Invoice email failed.' }
    await patchQuoteWorkflow(db, companyId, quoteId, workflow)
    await db.query('COMMIT')
    return workflow
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
}
