import { randomUUID } from 'node:crypto'
import { createError, getHeader, getQuery, type H3Event } from 'h3'
import { assertCompanyAccess } from './companyRequestScope'
import { saveSourceRequest } from './source-save-request'
import { normalizeQuote, quoteLineAmount, quoteTotals } from '../../utils/erp-quote'
import { readQuotePreferences } from './quote-preferences'
import { convertAcceptedQuote } from './quote-workflow'

export async function quoteCompany(event: H3Event, write = false, resource = 'quotes') {
  const session = await requireAuthSession(event)
  if (write && !['admin', 'manager', 'accountant', 'biller', 'user'].includes(session.data.role)) {
    throw createError({ statusCode: 403, statusMessage: `You do not have permission to save ${resource}.` })
  }
  const companyId = getHeader(event, 'x-company-id') || getQuery(event).companyId || session.data.companyId
  if (typeof companyId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Select a company.' })
  await assertCompanyAccess(event, companyId)
  return { companyId, userId: session.data.id }
}

export const quoteColumns = `q.id, q.quote_number AS "quoteNumber", q.reference_number AS "referenceNumber",
  to_char(q.quote_date, 'YYYY-MM-DD') AS "quoteDate", to_char(q.expiry_date, 'YYYY-MM-DD') AS "expiryDate",
  q.subject, q.status, q.notes, q.terms_and_conditions AS "termsAndConditions", q.pdf_template AS "pdfTemplate", q.discount,
  q.discount_type AS "discountType", q.adjustment, q.sub_total AS "subTotal", q.total, q.salesperson,
  COALESCE(f.field_values->'_erpQuote'->'workflow','{}'::jsonb) AS workflow,
  q.client_id AS "clientId", COALESCE(f.field_values->'_erpQuote'->'customer'->>'name', c.name) AS "clientName",
  COALESCE(f.field_values->'_erpQuote'->'customer'->>'phone', c.phone) AS "clientPhone"`
export const quoteJoins = `LEFT JOIN clients c ON c.id=q.client_id
  LEFT JOIN quote_custom_field_values f ON f.quote_id=q.id AND f.company_id=q.company_id`

export async function readQuote(db: any, companyId: string, id: string) {
  const row = (await db.query(`SELECT ${quoteColumns}, f.field_values->'_erpQuote' AS metadata
    FROM quotes q ${quoteJoins} WHERE q.id=$1 AND q.company_id=$2 AND q.deleted=false`, [id, companyId])).rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Quote not found.' })
  const metadata = row.metadata || {}
  const items = (await db.query(`SELECT i.id, i.variant_id AS "variantId", i.name, i.description,
      i.quantity, i.rate, i.amount, i.unit,v.images[1] AS image FROM quote_items i
      JOIN quotes q ON q.id=i.quote_id
      LEFT JOIN variants v ON v.id=i.variant_id AND v.company_id=q.company_id
      WHERE q.id=$1 AND q.company_id=$2 AND q.deleted=false ORDER BY i.serial_no`, [id, companyId])).rows
  return { ...row, metadata: undefined, revision: metadata.revision || '',
    pdfTemplate: row.pdfTemplate || 'classic', hideZeroValueItems: metadata.document?.hideZeroValueItems || false,
    workflow: metadata.workflow || {}, createdByUserId: metadata.createdByUserId || '',
    paymentTerms: metadata.paymentTerms || '', deliveryEstimate: metadata.deliveryEstimate || '',
    items: items.map((item: any) => ({ ...item, variantId: item.variantId || '', description: item.description || '', unit: item.unit || '',
      discount: metadata.lines?.[item.id]?.discount || 0, tax: metadata.lines?.[item.id]?.tax || 0,
      barcode: metadata.lines?.[item.id]?.barcode || '', size: metadata.lines?.[item.id]?.size || '' })) }
}

/** Source-only DML: quotes never invoke bill writers, stock adjustments, loyalty or financial posting. */
export async function writeQuote(db: any, context: { companyId: string; userId: string }, body: any, id?: string) {
  let input
  try { input = normalizeQuote(body) }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  const { companyId, userId } = context
  return saveSourceRequest(db, companyId, userId, id ? `quote-update:${id}` : 'quote-create', body.requestId, input, async () => {
    // Lock the company before the quote, serializing numbering and reference ownership checks.
    const company = (await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])).rows[0]
    if (!company) throw createError({ statusCode: 404, statusMessage: 'Company not found.' })
    const preferences = await readQuotePreferences(db, companyId)
    let oldMetadata: any = {}
    if (id) {
      const existing = (await db.query(`SELECT q.id, f.field_values->'_erpQuote'->>'revision' AS revision,q.status,f.field_values->'_erpQuote' AS metadata
        FROM quotes q LEFT JOIN quote_custom_field_values f ON f.quote_id=q.id AND f.company_id=q.company_id
        WHERE q.id=$1 AND q.company_id=$2 AND q.deleted=false FOR UPDATE OF q`, [id, companyId])).rows[0]
      if (!existing) throw createError({ statusCode: 404, statusMessage: 'Quote not found.' })
      if (existing.status === 'ACCEPTED' && !preferences.allowAcceptedEdits) throw createError({ statusCode: 409, statusMessage: 'Accepted quotes are locked by quote preferences.' })
      oldMetadata = existing.metadata || {}
      if ((existing.revision || '') !== body.revision) {
        throw createError({ statusCode: 409, statusMessage: 'This quote changed in another session. Reload it before saving.' })
      }
    }
    const customer = (await db.query(`SELECT c.name, c.phone FROM clients c JOIN company_clients cc ON cc.client_id=c.id
      WHERE c.id=$1 AND cc.company_id=$2 AND c.deleted=false FOR SHARE OF c, cc`, [input.clientId, companyId])).rows[0]
    if (!customer) throw createError({ statusCode: 400, statusMessage: 'Select a customer linked to this company.' })
    const variants = [...new Set(input.items.map(item => item.variantId).filter(Boolean))].sort()
    if (variants.length) {
      const found = (await db.query(`SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id
        WHERE v.id=ANY($1::text[]) AND p.company_id=$2 AND v.company_id=$2 FOR SHARE OF v, p`, [variants, companyId])).rows
      if (found.length !== variants.length) throw createError({ statusCode: 400, statusMessage: 'One or more products do not belong to this company.' })
    }
    const totals = quoteTotals(input)
    let quoteNumber: string
    if (!id) {
      // Existing company counter is reserved only within the successful source transaction.
      // Skip collisions with older quotes whose counter may have been reset.
      const numbering = (await db.query(`SELECT COALESCE(NULLIF(quote_prefix,''),'QT') AS prefix,
        GREATEST(COALESCE(quote_counter,1),1) AS counter FROM companies WHERE id=$1`, [companyId])).rows[0]
      let counter = Number(numbering.counter)
      for (;;) {
        quoteNumber = `${numbering.prefix}-${String(counter).padStart(5, '0')}`
        if (!(await db.query('SELECT 1 FROM quotes WHERE company_id=$1 AND quote_number=$2', [companyId, quoteNumber])).rows.length) break
        counter++
      }
      await db.query('UPDATE companies SET quote_counter=$2 WHERE id=$1', [companyId, counter + 1])
      id = randomUUID()
      await db.query(`INSERT INTO quotes(id,company_id,quote_number,quote_date,sub_total,total,attachments,deleted)
        VALUES($1,$2,$3,$4,0,0,ARRAY[]::text[],false)`, [id, companyId, quoteNumber!, input.quoteDate])
    }
    await db.query(`UPDATE quotes SET client_id=$3, quote_date=$4, expiry_date=$5, reference_number=$6,
      subject=$7, status=$8, notes=$9, terms_and_conditions=$10, discount=$11, discount_type=$12,
      adjustment=$13, sub_total=$14, total=$15, salesperson=$16,pdf_template=$17 WHERE id=$1 AND company_id=$2`,
    [id, companyId, input.clientId, input.quoteDate, input.expiryDate || null, input.referenceNumber,
      input.subject, input.status, input.notes, input.termsAndConditions, input.discount, input.discountType,
      input.adjustment, totals.subTotal, totals.total, input.salesperson, input.pdfTemplate || preferences.defaultTemplate])
    // Replace the owning quote's lines atomically. Never trust browser amounts or totals.
    await db.query('DELETE FROM quote_items WHERE quote_id=$1', [id])
    const lineMetadata: Record<string, any> = {}
    for (const [index, item] of input.items.entries()) {
      const itemId = randomUUID()
      await db.query(`INSERT INTO quote_items(id,quote_id,serial_no,name,description,quantity,rate,amount,unit,variant_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [itemId, id, index + 1, item.name, item.description, item.quantity, item.rate, quoteLineAmount(item), item.unit, item.variantId || null])
      lineMetadata[itemId] = { discount: item.discount, tax: item.tax, barcode: item.barcode, size: item.size }
    }
    const metadata = { version: 1, revision: randomUUID(), paymentTerms: input.paymentTerms,
      createdByUserId: oldMetadata.createdByUserId || userId, workflow: oldMetadata.workflow || {},
      document: { hideZeroValueItems: input.hideZeroValueItems ?? preferences.hideZeroValueItems },
      deliveryEstimate: input.deliveryEstimate, customer, lines: lineMetadata }
    const metadataResult = await db.query(`INSERT INTO quote_custom_field_values(id,quote_id,company_id,field_values) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(quote_id) DO UPDATE SET field_values=quote_custom_field_values.field_values || EXCLUDED.field_values
      WHERE quote_custom_field_values.company_id=EXCLUDED.company_id`,
    [randomUUID(), id, companyId, JSON.stringify({ _erpQuote: metadata })])
    if (metadataResult.rowCount !== 1) throw createError({ statusCode: 409, statusMessage: 'Quote details could not be saved for this company. Reload and try again.' })
    const saved = (await db.query('SELECT quote_number AS "quoteNumber" FROM quotes WHERE id=$1 AND company_id=$2', [id, companyId])).rows[0]
    const workflow = input.status === 'ACCEPTED' ? await convertAcceptedQuote(db, companyId, id!, userId) : metadata.workflow
    return { id, quoteNumber: saved.quoteNumber, revision: metadata.revision, workflow }
  })
}
