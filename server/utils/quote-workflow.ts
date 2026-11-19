import { createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { readQuote } from './erp-quotes'
import { readQuotePreferences } from './quote-preferences'
import { createBillSource } from './create-bill-source'
import { saveSourceRequest } from './source-save-request'
import { quoteLineAmount, quoteTotals } from '../../utils/erp-quote'

export async function patchQuoteWorkflow(db: any, companyId: string, id: string, workflow: any) {
  await db.query(`INSERT INTO quote_custom_field_values(id,quote_id,company_id,field_values)
    VALUES($1,$2,$3,jsonb_build_object('_erpQuote',jsonb_build_object('workflow',$4::jsonb)))
    ON CONFLICT(quote_id) DO UPDATE SET field_values=jsonb_set(quote_custom_field_values.field_values,'{_erpQuote}',
      COALESCE(quote_custom_field_values.field_values->'_erpQuote','{}'::jsonb)||jsonb_build_object('workflow',$4::jsonb),true)
    WHERE quote_custom_field_values.company_id=$3`, [randomUUID(), id, companyId, JSON.stringify(workflow)])
}

/** Allocate the document discount in cents; the resulting entries total exactly the quote. */
export function quoteInvoiceEntries(quote: any): any[] {
  const totals = quoteTotals(quote), base = Math.round(totals.subTotal * 100)
  const target = Math.round((totals.subTotal - totals.discountAmount) * 100)
  let remaining = target, remainingBase = base
  const entries = quote.items.map((line: any) => {
    const weight = Math.round(quoteLineAmount(line) * 100)
    const cents = remainingBase ? Math.min(remaining, Math.round(weight * remaining / remainingBase)) : 0
    remaining -= cents; remainingBase -= weight
    const value = cents / 100, gross = Number(line.quantity) * Number(line.rate)
    return { name: line.name, qty: Number(line.quantity), rate: Number(line.rate), value,
      discount: gross ? Math.round((1 - value / gross) * 100000000) / 1000000 : 0,
      tax: Number(line.tax), size: line.size || '', barcode: line.barcode || '', return: false,
      userName: quote.salesperson || '', ...(line.variantId ? { variant: { connect: { id: line.variantId } } } : {}) }
  })
  // An amount-only adjustment has no units, stock or return activity. Native ERP
  // uses the signed value for sales/tax and quantity only for stock/costs.
  if (Number(quote.adjustment)) entries.push({ name: 'Quote adjustment', qty: 0, rate: Number(quote.adjustment),
    value: Number(quote.adjustment), discount: 0, tax: 0, size: '', barcode: '', return: false, userName: quote.salesperson || '' })
  return entries
}

/** Company and quote must already be locked, in that order. One quote produces at most one bill. */
export async function convertAcceptedQuote(db: any, companyId: string, id: string, actor: string, forceIssue = false) {
  const quote = await readQuote(db, companyId, id)
  const preferences = await readQuotePreferences(db, companyId)
  const retainedText = { notes: preferences.retainCustomerNotes ? quote.notes : '',
    termsAndConditions: preferences.retainTermsAndConditions ? quote.termsAndConditions : '' }
  let workflow = { ...quote.workflow }
  if (quote.status !== 'ACCEPTED' || workflow.invoiceId) return workflow
  const mode = forceIssue ? 'issue' : preferences.conversion
  if (mode === 'none') return workflow
  await db.query('SAVEPOINT quote_conversion')
  try {
    if (mode === 'draft') {
      workflow = { ...workflow, conversion: 'draft', conversionError: '', invoiceDraft: {
        quote: { ...quote, ...retainedText, workflow: undefined }, sourceRevision: quote.revision,
        createdAt: workflow.invoiceDraft?.createdAt || new Date().toISOString(), dueDays: preferences.invoiceDueDays,
      } }
    } else {
      if (forceIssue && workflow.invoiceDraft && workflow.invoiceDraft.sourceRevision !== quote.revision)
        throw Error('The quote changed after this draft. Retry conversion from the quote before issuing it.')
      const result = await saveSourceRequest(db, companyId, actor, 'quote-invoice', id, { quoteId: id }, async () => {
        const entries = quoteInvoiceEntries(quote)
        for (const entry of entries) {
          const variantId = entry.variant?.connect.id
          if (!variantId) continue
          const stock = (await db.query(`SELECT i.id,p.category_id FROM items i
            JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
            JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id
            WHERE i.company_id=$1 AND v.id=$2 AND ($3='' OR i.barcode=$3) AND ($4='' OR COALESCE(i.size,'')=$4)
            AND v.status=true AND p.status=true ORDER BY i.id LIMIT 2 FOR UPDATE OF i`, [companyId, variantId, entry.barcode, entry.size])).rows
          if (stock.length !== 1) throw Error(`Review the stock item for ${entry.name} before issuing this invoice.`)
          entry.item = { connect: { id: stock[0].id } }
          if (stock[0].category_id) entry.category = { connect: { id: stock[0].category_id } }
        }
        const now = new Date(), due = new Date(now.getTime() + preferences.invoiceDueDays * 86400000)
        const dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(due)
        const creator = quote.createdByUserId || actor
        const staff = (await db.query('SELECT user_id FROM company_users WHERE company_id=$1 AND user_id=$2 AND deleted=false AND status=true', [companyId, creator])).rows[0]
        const billId = randomUUID()
        await db.query(`SELECT set_config('app.status_source','quote.invoice',true),set_config('app.status_actor',$1,true)`, [staff ? `user:${creator}` : 'quote-customer'])
        const created = await createBillSource(db, { uuid: billId, companyId, payload: {
          billingMode: 'invoice', company: { connect: { id: companyId } }, client: { connect: { id: quote.clientId } },
          ...retainedText,
          ...(staff ? { companyUser: { connect: { companyId_userId: { companyId, userId: creator } } } } : {}),
          createdAt: now.toISOString(), dueDate, invoicePaymentTerms: quote.paymentTerms || `Due in ${preferences.invoiceDueDays} days`,
          invoiceReference: quote.referenceNumber || quote.quoteNumber, subject: quote.referenceNumber || quote.quoteNumber,
          paymentMethod: 'Credit', paymentStatus: 'PENDING', type: 'BILL', discount: 0, discountType: 'percentage',
          subtotal: Number(quote.total), grandTotal: Number(quote.total), returnAmt: 0, entries: { create: entries },
        } })
        return created
      })
      const company = (await db.query('SELECT currency FROM companies WHERE id=$1', [companyId])).rows[0]
      workflow = { ...workflow, conversion: 'issued', invoiceId: result.billId, invoiceNumber: result.invoiceNumber, invoiceCurrency: company?.currency || 'INR',
        invoiceQuote: { ...quote, ...retainedText, workflow: undefined }, invoiceDraft: null, conversionError: '', emailStatus: mode === 'email' ? 'Pending' : 'Not requested' }
    }
    await patchQuoteWorkflow(db, companyId, id, workflow)
    await db.query('RELEASE SAVEPOINT quote_conversion')
    return workflow
  } catch (error: any) {
    await db.query('ROLLBACK TO SAVEPOINT quote_conversion')
    workflow = { ...workflow, conversionError: error?.statusMessage || error.message || 'Invoice conversion failed.' }
    await patchQuoteWorkflow(db, companyId, id, workflow)
    await db.query('RELEASE SAVEPOINT quote_conversion')
    return workflow
  }
}
