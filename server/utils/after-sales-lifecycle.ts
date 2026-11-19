import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { serviceActivation, nextServiceDue, addServiceDate, serviceToday, serviceDay } from '../../utils/after-sales'
import { nextCustomerProductReference } from './customer-product-numbering'
import { readSalesWorkflow } from './sales-workflow'

export const serviceError = (message: string, statusCode = 409) => createError({ statusCode, statusMessage: message })
export async function afterSalesAvailable(db: any) {
  return !!(await db.query("SELECT to_regclass('public.service_configurations') IS NOT NULL AS ready")).rows[0]?.ready
}
export async function serviceLock(db: any, companyId: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))::text', ['after-sales:' + companyId])
}
export async function serviceAudit(db: any, companyId: string, resourceId: string, actor: string, action: string, reason: string, before: any, after: any) {
  await db.query(`INSERT INTO service_audit(id,company_id,resource_id,actor_id,action,reason,before,after)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`, [randomUUID(), companyId, resourceId, actor, action, reason, JSON.stringify(before), JSON.stringify(after)])
}
export async function activateServiceAgreements(db: any, companyId: string, productId: string) {
  const p = (await db.query(`SELECT *,purchased_on::text,delivered_on::text,installed_on::text FROM customer_products WHERE id=$1 AND company_id=$2 AND status='ACTIVE'`, [productId, companyId])).rows[0]
  if (!p) return
  const agreements = (await db.query(`SELECT * FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2 AND status='PENDING' FOR UPDATE`, [productId, companyId])).rows
  for (const a of agreements) {
    const r = a.snapshot.rules, starts = serviceActivation(r, p)
    if (!starts) continue
    const ends = a.kind === 'MAINTENANCE' ? r.endDate || null : addServiceDate(starts, r.duration, r.durationUnit)
    const next = a.kind === 'MAINTENANCE' ? nextServiceDue(r, starts) : null
    await db.query(`UPDATE customer_service_agreements SET starts_on=$3,ends_on=$4,next_due=$5,status='ACTIVE' WHERE id=$1 AND company_id=$2`, [a.id, companyId, starts, ends, next])
  }
}
/** Called inside the source transaction. Optional installation/serial details use saved entry or item IDs. */
export async function registerBillServices(db: any, companyId: string, billId: string, unitDetails: any[] = [], actor = 'sale', purchasedDay?: string) {
  if (!await afterSalesAvailable(db)) return
  if (!(await readSalesWorkflow(db, companyId)).includeAfterSales) return
  await serviceLock(db, companyId)
  const bill = (await db.query(`SELECT b.*,CASE WHEN pg_typeof(b.created_at)::text='timestamp with time zone'
    THEN to_char(b.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD')
    ELSE to_char((b.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') END AS sale_day,o.id AS order_id
    FROM bills b LEFT JOIN ecomm_orders o ON o.bill_id=b.id AND o.company_id=b.company_id
    WHERE b.id=$1 AND b.company_id=$2 AND NOT COALESCE(b.deleted,false)`, [billId, companyId])).rows[0]
  if (!bill) return
  const entries = (await db.query(`SELECT e.id,e.item_id,e.name,e.qty,v.product_id FROM entries e
    JOIN variants v ON v.id=e.variant_id AND v.company_id=e.company_id
    WHERE e.bill_id=$1 AND e.company_id=$2 AND NOT e.return
    AND EXISTS(SELECT 1 FROM product_service_links l WHERE l.product_id=v.product_id AND l.company_id=$2) ORDER BY e.id`, [billId, companyId])).rows
  if (!entries.length) return
  const member = bill.client_id && (await db.query('SELECT 1 FROM company_clients WHERE company_id=$1 AND client_id=$2', [companyId, bill.client_id])).rowCount
  if (!member) throw serviceError('Select a client for products with warranty, guarantee or maintenance.', 400)
  if (!Array.isArray(unitDetails) || unitDetails.length > 10000) throw serviceError('Invalid product-unit registration details.', 400)
  for (const e of entries) {
    const qty = Number(e.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw serviceError('Covered products require whole-unit quantities between 1 and 10000.', 400)
    const existing = (await db.query(`SELECT id,client_id,status,purchased_on::text,item_id,product_id,
      EXISTS(SELECT 1 FROM service_audit a WHERE a.company_id=p.company_id AND a.resource_id=p.id
        AND (a.action='INVOICE_UNIT_REMOVED' OR (a.action='CANCELLED' AND a.reason='Removed by invoice edit'))) AS removed_by_edit
      FROM customer_products p WHERE entry_id=$1 AND company_id=$2 ORDER BY created_at,id`, [e.id, companyId])).rows
    if (existing.some((p: any) => ['ACTIVE','REPLACED'].includes(p.status) && (p.item_id !== e.item_id || p.product_id !== e.product_id))) throw serviceError('Select the specific client units removed before changing a registered product.')
    const retained = existing.filter((p: any) => !(p.status === 'CANCELLED' && p.removed_by_edit) && p.item_id === e.item_id && p.product_id === e.product_id)
    if (retained.some((p: any) => p.client_id !== bill.client_id)) throw serviceError('A registered product belongs to a different client. Correct the registration before changing the invoice client.')
    const occupied = retained.length
    const configs = (await db.query(`SELECT c.* FROM service_configurations c JOIN product_service_links l ON l.configuration_id=c.id AND l.company_id=c.company_id
      WHERE l.company_id=$1 AND l.product_id=$2 ORDER BY c.id FOR SHARE OF c`, [companyId, e.product_id])).rows
    for (let n = occupied; n < qty; n++) {
      const id = randomUUID(), ordinal = existing.length + n - occupied
      const details = unitDetails.find((d: any) => (d.entryId === e.id || (!d.entryId && !d.lineKey && d.itemId === e.item_id)) && d.unit === n) || {}
      const serial = typeof details.serialNumber === 'string' ? details.serialNumber.trim().slice(0, 200) : null
      const installed = details.installedOn ? serviceDay(details.installedOn) : null
      const delivered = !bill.order_id && details.deliveredOn ? serviceDay(details.deliveredOn) : null
      const reference = await nextCustomerProductReference(db, companyId, id)
      await db.query(`INSERT INTO customer_products(id,company_id,client_id,reference,source_key,product_id,item_id,bill_id,entry_id,order_id,serial_number,name,purchased_on,installed_on,delivered_on)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(company_id,source_key) DO NOTHING`,
      [id, companyId, bill.client_id, reference, `entry:${e.id}:${ordinal}`, e.product_id, e.item_id, billId, e.id, bill.order_id, serial, e.name, existing[0]?.purchased_on || purchasedDay || bill.sale_day, installed, delivered])
      for (const c of configs) await db.query(`INSERT INTO customer_service_agreements(id,company_id,customer_product_id,configuration_id,revision,kind,snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [randomUUID(), companyId, id, c.id, c.revision, c.kind, JSON.stringify({ name: c.name, kind: c.kind, rules: c.rules })])
      await activateServiceAgreements(db, companyId, id)
      await serviceAudit(db, companyId, id, actor, 'REGISTERED', 'Registered with sale', null, { billId, entryId: e.id })
    }
  }
}
export async function deliveredBillServices(db: any, companyId: string, orderId: string, day = serviceToday()) {
  if (!await afterSalesAvailable(db)) return
  await serviceLock(db, companyId)
  const products = (await db.query(`UPDATE customer_products SET delivered_on=COALESCE(delivered_on,$3::date)
    WHERE order_id=$1 AND company_id=$2 AND status='ACTIVE' RETURNING id`, [orderId, companyId, day])).rows
  for (const p of products) await activateServiceAgreements(db, companyId, p.id)
}
export async function cancelCustomerProducts(db: any, companyId: string, ids: string[], actor: string, reason: string, status = 'CANCELLED', visited = new Set<string>()) {
  if (!ids.length) return
  await serviceLock(db, companyId)
  for (const id of [...new Set(ids)].sort()) {
    if (visited.has(id)) continue
    visited.add(id)
    const p = (await db.query('SELECT * FROM customer_products WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, companyId])).rows[0]
    if (!p) throw serviceError('Client product not found.', 404)
    if (p.status === 'REPLACED' && p.replaced_by_id) {
      const carried = (await db.query(`SELECT id FROM service_audit WHERE company_id=$1 AND resource_id=$2 AND action='REPLACE'
        AND after->>'replacementId'=$3 AND after->>'restart' IS DISTINCT FROM 'true' LIMIT 1`, [companyId, p.id, p.replaced_by_id])).rowCount
      if (carried) await cancelCustomerProducts(db, companyId, [p.replaced_by_id], actor, reason, status, visited)
    }
    if (!['ACTIVE','REPLACED'].includes(p.status)) continue
    await db.query('UPDATE customer_products SET status=$3 WHERE id=$1 AND company_id=$2', [id, companyId, status])
    await db.query(`UPDATE customer_service_agreements SET status='CANCELLED',next_due=NULL WHERE customer_product_id=$1 AND company_id=$2`, [id, companyId])
    await db.query(`UPDATE maintenance_occurrences SET status='CANCELLED' WHERE company_id=$2 AND agreement_id IN
      (SELECT id FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2) AND status='DUE'`, [id, companyId])
    await db.query(`UPDATE service_jobs SET status='CANCELLED',updated_at=now() WHERE company_id=$2 AND agreement_id IN
      (SELECT id FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2) AND status NOT IN('COMPLETED','RESOLVED','REJECTED','CANCELLED')`, [id, companyId])
    await serviceAudit(db, companyId, id, actor, status, reason, p, { status })
  }
}
export async function cancelBillServices(db: any, companyId: string, billId: string, actor: string, reason: string) {
  if (!await afterSalesAvailable(db)) return
  const ids = (await db.query(`SELECT id FROM customer_products WHERE bill_id=$1 AND company_id=$2 AND status IN('ACTIVE','REPLACED')`, [billId, companyId])).rows.map((r: any) => r.id)
  await cancelCustomerProducts(db, companyId, ids, actor, reason)
}
export async function returnBillServices(db: any, companyId: string, billId: string, unitIds: string[] = [], actor = 'sales-return') {
  if (!await afterSalesAvailable(db)) return
  await serviceLock(db, companyId)
  const bill = (await db.query('SELECT client_id FROM bills WHERE id=$1 AND company_id=$2', [billId, companyId])).rows[0]
  const entries = (await db.query(`SELECT item_id,sum(qty) AS qty FROM entries WHERE bill_id=$1 AND company_id=$2 AND return AND qty>0 GROUP BY item_id`, [billId, companyId])).rows
  if (!Array.isArray(unitIds) || unitIds.some(v => typeof v !== 'string')) throw serviceError('Select client units being returned.', 400)
  const selected = unitIds.length ? (await db.query(`SELECT * FROM customer_products WHERE id=ANY($1::text[]) AND company_id=$2 AND client_id=$3 AND status='ACTIVE'`, [unitIds, companyId, bill?.client_id])).rows : []
  if (selected.length !== new Set(unitIds).size || selected.some((p: any) => !entries.some((e: any) => e.item_id === p.item_id))) throw serviceError('Selected return units must belong to this client and match the returned items.', 400)
  for (const e of entries) {
    const prior = (await db.query(`SELECT count(*)::int AS qty FROM service_audit au JOIN customer_products p ON p.id=au.resource_id AND p.company_id=au.company_id
      WHERE au.company_id=$1 AND au.action='SALE_RETURN' AND au.after->>'returnBillId'=$2 AND p.item_id=$3`, [companyId, billId, e.item_id])).rows[0]?.qty || 0
    const registered = (await db.query(`SELECT 1 FROM customer_products WHERE company_id=$1 AND item_id=$2 AND status='ACTIVE' AND ($3::text IS NULL OR client_id=$3) LIMIT 1`, [companyId, e.item_id, bill?.client_id || null])).rowCount
    const matching = selected.filter((p: any) => p.item_id === e.item_id)
    if((registered||prior)&&!Number.isInteger(Number(e.qty)))throw serviceError('Covered returns require whole-unit quantities.',400)
    if ((registered || prior) && prior + matching.length !== Number(e.qty)) throw serviceError('Select the exact registered units for each returned covered item.', 400)
  }
  await cancelCustomerProducts(db, companyId, unitIds, actor, 'Completed sales return', 'RETURNED')
  for (const p of selected) await serviceAudit(db, companyId, p.id, actor, 'SALE_RETURN', 'Completed sales return', null, { returnBillId: billId })
}
/** Run after an edit has saved its final entries; unit reductions require explicit identities. */
export async function reconcileBillServices(db: any, companyId: string, billId: string, removedIds: string[] = [], actor = 'invoice-edit', unitDetails: any[] = []) {
  if (!await afterSalesAvailable(db)) return
  await serviceLock(db, companyId)
  if (!Array.isArray(removedIds) || removedIds.some(id => typeof id !== 'string')) throw serviceError('Select the registered units removed from this invoice.', 400)
  if (removedIds.length) {
    const owned = (await db.query(`SELECT p.id,p.status,EXISTS(SELECT 1 FROM service_audit a WHERE a.company_id=p.company_id AND a.resource_id=p.id
      AND (a.action='INVOICE_UNIT_REMOVED' OR (a.action='CANCELLED' AND a.reason='Removed by invoice edit'))) AS removed_by_edit
      FROM customer_products p WHERE p.id=ANY($1::text[]) AND p.company_id=$2 AND p.bill_id=$3`, [removedIds, companyId, billId])).rows
    if (owned.length !== new Set(removedIds).size) throw serviceError('Selected units do not belong to this invoice.', 400)
    if (owned.some((p:any)=>!['ACTIVE','REPLACED'].includes(p.status)&&!(p.status==='CANCELLED'&&p.removed_by_edit))) throw serviceError('Only active or replaced units can be removed by an invoice edit. Returned units retain their original sale history.',400)
    await cancelCustomerProducts(db, companyId, removedIds, actor, 'Removed by invoice edit')
    for (const id of [...new Set(removedIds)]) await serviceAudit(db,companyId,id,actor,'INVOICE_UNIT_REMOVED','Removed by invoice edit',null,{billId})
  }
  const excess = (await db.query(`SELECT p.entry_id FROM customer_products p LEFT JOIN entries e ON e.id=p.entry_id AND e.bill_id=p.bill_id
    WHERE p.company_id=$1 AND p.bill_id=$2 AND p.status IN('ACTIVE','RETURNED','REPLACED') GROUP BY p.entry_id,e.qty
    HAVING count(*)>COALESCE(e.qty,0)`, [companyId, billId])).rowCount
  if (excess) throw serviceError('Select the specific client units removed by this quantity reduction.')
  const changedIdentity = (await db.query(`SELECT p.id FROM customer_products p
    LEFT JOIN entries e ON e.id=p.entry_id AND e.bill_id=p.bill_id AND e.company_id=p.company_id
    LEFT JOIN variants v ON v.id=e.variant_id AND v.company_id=e.company_id
    WHERE p.company_id=$1 AND p.bill_id=$2 AND p.status IN('ACTIVE','REPLACED')
    AND (e.id IS NULL OR e.return OR p.item_id IS DISTINCT FROM e.item_id OR p.product_id IS DISTINCT FROM v.product_id) LIMIT 1`, [companyId, billId])).rowCount
  if (changedIdentity) throw serviceError('Select the specific client units removed before changing a registered product.')
  const mismatched=(await db.query(`SELECT p.id FROM customer_products p JOIN bills b ON b.id=p.bill_id AND b.company_id=p.company_id
    WHERE p.company_id=$1 AND p.bill_id=$2 AND p.status='ACTIVE' AND p.client_id IS DISTINCT FROM b.client_id LIMIT 1`,[companyId,billId])).rowCount
  if(mismatched)throw serviceError('Existing registered units belong to the original client. Remove them explicitly before reassigning this invoice.')
  await registerBillServices(db, companyId, billId, unitDetails, actor)
}
