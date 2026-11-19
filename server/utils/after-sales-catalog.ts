import { randomUUID } from 'node:crypto'
import { serviceMoney, serviceText } from '../../utils/after-sales'
import { normalizeServiceLines } from '../../utils/service-items'
import { serviceAudit, serviceError } from './after-sales-lifecycle'
import { ensureServiceChargeCategory, readServiceChargeCategory } from './after-sales-charge-category'

async function catalogReady(db: any) {
  if (!(await db.query("SELECT to_regclass('public.service_charges') IS NOT NULL AS ready")).rows[0]?.ready)
    throw serviceError('Service items require the prepared service-items migration.', 503)
}
export async function saveProductServiceFlag(db: any, companyId: string, productId: string, value: unknown) {
  if (value === undefined) return
  if (typeof value !== 'boolean') throw serviceError('Select a valid service product option.', 400)
  const ready = (await db.query(`SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='products'::regclass
    AND attname='is_service_product' AND NOT attisdropped) AS ready`)).rows[0]?.ready
  if (!ready) { if (value) throw serviceError('Service products require the prepared service-items migration.', 503); return }
  await db.query('UPDATE products SET is_service_product=$3 WHERE id=$1 AND company_id=$2', [productId, companyId, value])
}
export async function serviceCatalog(db: any, companyId: string, query: any) {
  await catalogReady(db)
  const q = '%' + String(query.q || '').trim().slice(0, 200) + '%'
  const charges = (await db.query(`SELECT * FROM service_charges WHERE company_id=$1 AND name ILIKE $2
    AND ($3 OR NOT archived) ORDER BY name,id LIMIT 200`, [companyId, q, query.includeArchived === 'true'])).rows
  const products = (await db.query(`SELECT p.id,p.name,p.status,p.product_no,
    COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'rate',v.s_price,'unit',v.unit)) FILTER(WHERE v.id IS NOT NULL),'[]'::jsonb) AS variants
    FROM products p LEFT JOIN variants v ON v.product_id=p.id AND v.company_id=p.company_id
    WHERE p.company_id=$1 AND p.is_service_product=true AND p.name ILIKE $2
    GROUP BY p.id ORDER BY p.name,p.id LIMIT 200`, [companyId, q])).rows
  const chargeCategory = await readServiceChargeCategory(db, companyId)
  return { charges, products, chargeCategory }
}
export async function saveServiceCharge(db: any, companyId: string, actor: string, body: any) {
  await catalogReady(db)
  let values: any
  try {
    const tax = serviceMoney(body.tax ?? 0)
    if (tax > 100) throw Error('Tax must be between 0 and 100.')
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw Error('Select a valid archive option.')
    values = { name: serviceText(body.name, 'Charge name', 500, true), description: serviceText(body.description, 'Description', 2000),
      rate: serviceMoney(body.rate ?? 0), tax, unit: serviceText(body.unit || 'Service', 'Unit', 50, true), archived: body.archived ?? false }
  } catch (error: any) { throw serviceError(error.message, 400) }
  const old = body.id ? (await db.query('SELECT * FROM service_charges WHERE id=$1 AND company_id=$2 FOR UPDATE', [body.id, companyId])).rows[0] : null
  if (body.id && !old) throw serviceError('Service charge not found.', 404)
  const category = await ensureServiceChargeCategory(db, companyId, actor)
  const id = old?.id || randomUUID()
  await db.query(`INSERT INTO service_charges(id,company_id,name,description,rate,tax,unit,archived,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,
    rate=excluded.rate,tax=excluded.tax,unit=excluded.unit,archived=excluded.archived,updated_at=now() WHERE service_charges.company_id=$2`,
    [id, companyId, values.name, values.description, values.rate, values.tax, values.unit, values.archived])
  await serviceAudit(db, companyId, id, actor, 'CHARGE_SAVED', 'Service charge catalog updated', old, { ...values, categoryId: category.id })
  return { id, category }
}
/** Validate stock ownership on save as well as issuance. Charge labels/prices are editable snapshots. */
export async function validateServiceParts(db: any, companyId: string, parts: unknown) {
  let lines: ReturnType<typeof normalizeServiceLines>
  try { lines = normalizeServiceLines(parts, true) } catch (error: any) { throw serviceError(error.message, 400) }
  for (const line of lines) {
    const result = await db.query(`SELECT i.id FROM items i JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
      JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id WHERE i.company_id=$1 AND v.id=$2
      AND ($3='' OR i.barcode=$3) AND ($4='' OR COALESCE(i.size,'')=$4) AND v.status=true AND p.status=true LIMIT 2 FOR SHARE OF i,v,p`,
      [companyId, line.variantId, line.barcode, line.size])
    if (result.rows.length !== 1) throw serviceError('Select an active product belonging to this company.', 400)
  }
  return lines
}
