import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { quoteInvoiceEntries } from './quote-workflow'
import { createBillSource } from './create-bill-source'
import { quoteTotals } from '../../utils/erp-quote'
import { applyServiceChargeCategory } from './after-sales-charge-category'

export const programError = (message: string, statusCode = 409) => createError({ statusCode, statusMessage: message })
export function programInput<T>(read: () => T): T {
  try { return read() } catch (error: any) { throw programError(error.message, 400) }
}
export async function programCompany(db: any, companyId: string) {
  const company = (await db.query('SELECT id,currency,name FROM companies WHERE id=$1 AND status=true FOR UPDATE', [companyId])).rows[0]
  if (!company) throw programError('Active company not found.', 404)
  return company
}
export async function programCustomer(db: any, companyId: string, clientId: string) {
  const customer = (await db.query(`SELECT c.id,c.name,c.phone,c.email FROM clients c JOIN company_clients cc ON cc.client_id=c.id
    WHERE c.id=$1 AND cc.company_id=$2 AND c.deleted=false FOR SHARE OF c,cc`, [clientId, companyId])).rows[0]
  if (!customer) throw programError('Select a customer linked to this company.')
  return customer
}
export async function programItems(db: any, companyId: string, template: any, forIssue = false) {
  const entries = quoteInvoiceEntries(template)
  for (const entry of entries) {
    if (Number(entry.qty) === 0) entry.name = 'Adjustment'
    const variantId = entry.variant?.connect.id
    if (!variantId) continue
    const stock = (await db.query(`SELECT i.id,p.category_id FROM items i
      JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
      JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id
      WHERE i.company_id=$1 AND v.id=$2 AND ($3='' OR i.barcode=$3) AND ($4='' OR COALESCE(i.size,'')=$4)
      AND v.status=true AND p.status=true ORDER BY i.id LIMIT 2 ${forIssue ? 'FOR UPDATE OF i' : 'FOR SHARE OF i,v,p'}`,
    [companyId, variantId, entry.barcode, entry.size])).rows
    if (stock.length !== 1) throw programError(`Select an active, unambiguous stock item for ${entry.name}.`)
    entry.item = { connect: { id: stock[0].id } }
    if (stock[0].category_id) entry.category = { connect: { id: stock[0].category_id } }
  }
  return entries
}
export async function issueProgramInvoice(db: any, companyId: string, actor: string, template: any, date: string, dueDate: string, options: { allowZeroTotal?: boolean; serviceChargeCategoryId?: string } = {}) {
  await programCustomer(db, companyId, template.clientId)
  const entries = await programItems(db, companyId, template, true)
  if (options.serviceChargeCategoryId) await applyServiceChargeCategory(db, companyId, entries, options.serviceChargeCategoryId)
  const staff = (await db.query('SELECT user_id FROM company_users WHERE company_id=$1 AND user_id=$2 AND deleted=false AND status=true', [companyId, actor])).rows[0]
  const total = quoteTotals(template).total
  await db.query(`SELECT set_config('app.status_source','recurring.invoice',true),set_config('app.status_actor',$1,true)`, ['user:' + actor])
  return createBillSource(db, { uuid: randomUUID(), companyId, payload: {
    billingMode: 'invoice', company: { connect: { id: companyId } }, client: { connect: { id: template.clientId } },
    ...(staff ? { companyUser: { connect: { companyId_userId: { companyId, userId: actor } } } } : {}),
    createdAt: date + 'T00:00:00+05:30', dueDate, invoicePaymentTerms: template.paymentTerms || 'Due on ' + dueDate,
    subject: template.subject, notes: template.notes, termsAndConditions: template.termsAndConditions,
    paymentMethod: 'Credit', paymentStatus: 'PENDING', type: 'BILL', discount: 0, discountType: 'percentage',
    subtotal: total, grandTotal: total, returnAmt: 0, entries: { create: entries },
  } }, options)
}
