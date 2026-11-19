import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { normalizeSalesOrder, salesOrderStatuses } from '../../utils/sales-order'
import { quoteLineAmount, quoteTotals } from '../../utils/erp-quote'
import { saveSourceRequest } from './source-save-request'
import { readQuotePreferences } from './quote-preferences'
import { documentAmountSql, documentDateSql, documentListOptions } from './document-list'

export const salesOrderColumns = `s.id,s.order_number AS "orderNumber",s.reference_number AS "referenceNumber",
  to_char(s.order_date,'YYYY-MM-DD') AS "orderDate",to_char(s.expected_shipment_date,'YYYY-MM-DD') AS "expectedShipmentDate",
  s.payment_terms AS "paymentTerms",s.delivery_method AS "deliveryMethod",s.salesperson,s.status,s.invoiced,
  s.payment_status AS "paymentStatus",s.notes,s.terms_and_conditions AS "termsAndConditions",s.discount,s.discount_type AS "discountType",
  s.adjustment,s.sub_total AS "subTotal",s.total,s.client_id AS "clientId",COALESCE(m.preference_value->'customer'->>'name',c.name) AS "clientName",
  COALESCE(m.preference_value->'customer'->>'phone',c.phone) AS "clientPhone",m.preference_value AS metadata`
export const salesOrderJoins = `LEFT JOIN clients c ON c.id=s.client_id
  LEFT JOIN general_preferences m ON m.company_id=s.company_id AND m.page_name='sales-orders' AND m.preference_key='document:'||s.id`
export async function readSalesOrder(db: any, companyId: string, id: string) {
  const row = (await db.query(`SELECT ${salesOrderColumns} FROM sales_orders s ${salesOrderJoins} WHERE s.id=$1 AND s.company_id=$2 AND s.deleted=false`, [id, companyId])).rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Sales order not found.' })
  const metadata = row.metadata || {}
  const lines = (await db.query(`SELECT i.id,i.variant_id AS "variantId",i.name,i.description,i.quantity,i.rate,i.amount,i.unit
    FROM sales_order_items i JOIN sales_orders s ON s.id=i.sales_order_id WHERE s.id=$1 AND s.company_id=$2 AND s.deleted=false ORDER BY i.serial_no`, [id, companyId])).rows
  const preferences = await readQuotePreferences(db, companyId, 'sales-orders')
  return { ...row, metadata: undefined, revision: metadata.revision || '', subject: metadata.subject || '',
    documentDesign: preferences.documentDesign, hideZeroValueItems: metadata.hideZeroValueItems || false,
    items: lines.map((line: any) => ({ ...line, variantId: line.variantId || '', description: line.description || '', unit: line.unit || '',
      discount: metadata.lines?.[line.id]?.discount || 0, tax: metadata.lines?.[line.id]?.tax || 0, barcode: metadata.lines?.[line.id]?.barcode || '', size: metadata.lines?.[line.id]?.size || '' })) }
}
export async function writeSalesOrder(db: any, context: { companyId: string; userId: string }, body: any, id?: string) {
  let input
  try { input = normalizeSalesOrder(body) } catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message.replace(/Quote date/g, 'Order date').replace(/Expiry date/g, 'Expected shipment date') }) }
  const { companyId, userId } = context
  return saveSourceRequest(db, companyId, userId, id ? `sales-order-update:${id}` : 'sales-order-create', body.requestId, input, async () => {
    if (!(await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])).rows.length) throw createError({ statusCode: 404, statusMessage: 'Company not found.' })
    const preferences = await readQuotePreferences(db, companyId, 'sales-orders')
    if (id) {
      const old = (await db.query(`SELECT s.id,s.status,m.preference_value->>'revision' AS revision FROM sales_orders s ${salesOrderJoins}
        WHERE s.id=$1 AND s.company_id=$2 AND s.deleted=false FOR UPDATE OF s`, [id, companyId])).rows[0]
      if (!old) throw createError({ statusCode: 404, statusMessage: 'Sales order not found.' })
      if (['CLOSED','CANCELLED'].includes(old.status) && !preferences.allowAcceptedEdits) throw createError({ statusCode: 409, statusMessage: 'Closed and cancelled sales orders are locked by preferences.' })
      if ((old.revision || '') !== body.revision) throw createError({ statusCode: 409, statusMessage: 'This sales order changed in another session. Reload before saving.' })
    }
    const customer = (await db.query(`SELECT c.name,c.phone FROM clients c JOIN company_clients cc ON cc.client_id=c.id
      WHERE c.id=$1 AND cc.company_id=$2 AND c.deleted=false FOR SHARE OF c,cc`, [input.clientId, companyId])).rows[0]
    if (!customer) throw createError({ statusCode: 400, statusMessage: 'Select a customer linked to this company.' })
    const variants = [...new Set(input.items.map(line => line.variantId).filter(Boolean))].sort()
    if (variants.length && (await db.query(`SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id AND p.company_id=v.company_id
      WHERE v.id=ANY($1::text[]) AND v.company_id=$2 FOR SHARE OF v,p`, [variants, companyId])).rows.length !== variants.length)
      throw createError({ statusCode: 400, statusMessage: 'One or more products do not belong to this company.' })
    if (!id) {
      const numbering = (await db.query(`SELECT COALESCE(NULLIF(sales_order_prefix,''),'SO') AS prefix,GREATEST(COALESCE(sales_order_counter,1),1) AS counter FROM companies WHERE id=$1`, [companyId])).rows[0]
      let counter = Number(numbering.counter), number: string
      do { number = `${numbering.prefix}-${String(counter++).padStart(5,'0')}` } while ((await db.query('SELECT 1 FROM sales_orders WHERE company_id=$1 AND order_number=$2', [companyId, number])).rows.length)
      await db.query('UPDATE companies SET sales_order_counter=$2 WHERE id=$1', [companyId, counter])
      id = randomUUID()
      await db.query(`INSERT INTO sales_orders(id,company_id,order_number,order_date,attachments,deleted) VALUES($1,$2,$3,$4,ARRAY[]::text[],false)`, [id, companyId, number, input.quoteDate])
    }
    const totals = quoteTotals(input)
    await db.query(`UPDATE sales_orders SET client_id=$3,order_date=$4,expected_shipment_date=$5,reference_number=$6,payment_terms=$7,
      delivery_method=$8,salesperson=$9,status=$10,notes=$11,terms_and_conditions=$12,discount=$13,discount_type=$14,adjustment=$15,sub_total=$16,total=$17
      WHERE id=$1 AND company_id=$2`, [id, companyId, input.clientId, input.quoteDate, input.expiryDate || null, input.referenceNumber,
      input.paymentTerms, input.deliveryEstimate, input.salesperson, input.status, input.notes, input.termsAndConditions, input.discount, input.discountType, input.adjustment, totals.subTotal, totals.total])
    await db.query('DELETE FROM sales_order_items WHERE sales_order_id=$1', [id])
    const lineMetadata: Record<string, any> = {}
    for (const [index,line] of input.items.entries()) {
      const lineId = randomUUID()
      await db.query(`INSERT INTO sales_order_items(id,sales_order_id,serial_no,name,description,quantity,rate,amount,unit,variant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [lineId,id,index+1,line.name,line.description,line.quantity,line.rate,quoteLineAmount(line),line.unit,line.variantId || null])
      lineMetadata[lineId] = { discount: line.discount, tax: line.tax, barcode: line.barcode, size: line.size }
    }
    const revision = randomUUID(), metadata = { version: 1, revision, subject: input.subject, customer, lines: lineMetadata,
      hideZeroValueItems: input.hideZeroValueItems ?? preferences.hideZeroValueItems }
    const saved = await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
      VALUES($1,$2,'sales-orders',$3,$4::jsonb,true) ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`,
      [randomUUID(),companyId,`document:${id}`,JSON.stringify(metadata)])
    if (saved.rowCount !== 1) throw createError({ statusCode: 409, statusMessage: 'Sales order details could not be saved.' })
    const row = (await db.query('SELECT order_number AS "orderNumber" FROM sales_orders WHERE id=$1 AND company_id=$2', [id,companyId])).rows[0]
    return { id, orderNumber: row.orderNumber, revision }
  })
}
export function salesOrderListQuery(companyId: string, query: Record<string,any>) {
  const options = documentListOptions(query,['orderNumber','orderDate','clientName','expectedShipmentDate','status','total'],'orderDate')
  const status = String(query.status || '')
  if (status && !salesOrderStatuses.includes(status as any)) throw createError({statusCode:400,statusMessage:'Select a valid sales order status.'})
  const values: any[] = [companyId,`%${String(query.q || '').trim().slice(0,200)}%`,status]
  const where = `s.company_id=$1 AND s.deleted=false AND ($3='' OR s.status::text=$3) AND (s.order_number ILIKE $2 OR s.reference_number ILIKE $2 OR c.name ILIKE $2 OR c.phone ILIKE $2 OR m.preference_value->'customer'->>'name' ILIKE $2 OR m.preference_value->'customer'->>'phone' ILIKE $2 OR m.preference_value->>'subject' ILIKE $2)`
    + documentDateSql('s.order_date',options.dates,values,true) + documentAmountSql('s.total',options.amounts,values)
  values.push(options.pageSize,(options.page-1)*options.pageSize)
  return { values, sql: `WITH matched AS (SELECT ${salesOrderColumns} FROM sales_orders s ${salesOrderJoins} WHERE ${where}),
    paged AS (SELECT * FROM matched ORDER BY "${options.sort}" ${options.order} NULLS LAST,"orderNumber" DESC,id DESC LIMIT $${values.length-1} OFFSET $${values.length})
    SELECT (SELECT count(*) FROM matched) AS total,COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS rows,
    (SELECT json_build_object('amount',COALESCE(sum(total),0),'draft',COALESCE(sum(total) FILTER(WHERE status='DRAFT'),0),'confirmed',COALESCE(sum(total) FILTER(WHERE status='CONFIRMED'),0),'closed',COALESCE(sum(total) FILTER(WHERE status='CLOSED'),0),'cancelled',COALESCE(sum(total) FILTER(WHERE status='CANCELLED'),0)) FROM matched) AS summary` }
}
