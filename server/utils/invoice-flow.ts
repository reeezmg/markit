import { createError } from 'h3'
import { invoiceDetails } from '../../utils/invoice-flow'

export async function validateInvoiceSource(db: any, companyId: string, payload: any, options: { allowZeroTotal?: boolean } = {}) {
  let details
  try { details = invoiceDetails(payload, payload.createdAt || payload.date) }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  const clientId = payload.client?.connect?.id || payload.clientId
  if (!clientId || payload.creditUserId || payload.paymentMethod !== 'Credit' || payload.splitPayments?.length ||
    !Number.isFinite(Number(payload.grandTotal)) || Number(payload.grandTotal) < 0 || (!options.allowZeroTotal && Number(payload.grandTotal) === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'An invoice needs a customer, a positive total and payment on account.' })
  }
  const customer = await db.query(`SELECT c.id FROM clients c JOIN company_clients cc ON cc.client_id=c.id
    WHERE c.id=$1 AND cc.company_id=$2 AND c.deleted=false FOR SHARE OF c,cc`, [clientId, companyId])
  if (!customer.rows.length) throw createError({ statusCode: 400, statusMessage: 'Select a customer linked to this company.' })
  const setup = await db.query(`SELECT s.company_id FROM accountant_v2_erp_settings s
    JOIN accountant_v2_accounting_accounts a ON a.id=s.accounts->>'receivable' AND a.company_id=s.company_id
    WHERE s.company_id=$1 AND s.enabled=true AND a.account_type='ACCOUNTS_RECEIVABLE'
    AND a.is_active=true AND a.deleted_at IS NULL FOR SHARE OF s,a`, [companyId])
  if (!setup.rows.length) throw createError({ statusCode: 409, statusMessage: 'Enable ERP Accounting with a receivable account in Settings > Account before issuing invoices.' })
  return details
}

export async function writeInvoiceDetails(db: any, companyId: string, id: string, details: ReturnType<typeof invoiceDetails>) {
  await db.query(`UPDATE bills SET invoice_code=COALESCE(invoice_code,'INV-'||invoice_number::text),
    due_date=$3::date,invoice_payment_terms=$4,subject=$5 WHERE id=$1 AND company_id=$2`,
  [id, companyId, details.dueDate, details.invoicePaymentTerms, details.subject])
}

export const invoiceSendStatusSql = `(SELECT a."after"->>'status' FROM accountant_v2_accountant_audit a
  WHERE a.company_id=b.company_id AND a.resource='invoice-send' AND a."resourceId"=b.id
  ORDER BY a.updated_at DESC,a.id DESC LIMIT 1)`
