import { randomUUID } from 'node:crypto'
import { serviceAudit, serviceError, serviceLock } from './after-sales-lifecycle'

export const serviceChargeCategoryName = 'Service Charges'

/** The preference keeps the association intact if staff rename the category. */
export async function readServiceChargeCategory(db: any, companyId: string) {
  return (await db.query(`SELECT c.id,c.name,c.status FROM categories c
    LEFT JOIN general_preferences p ON p.company_id=c.company_id AND p.page_name='after-sales'
      AND p.preference_key='service-charge-category' AND p.active=true
    WHERE c.company_id=$1 AND (c.id=p.preference_value->>'categoryId' OR lower(btrim(c.name))=lower($2))
    ORDER BY (c.id=COALESCE(p.preference_value->>'categoryId','')) DESC,c.status DESC,c.created_at,c.id LIMIT 1`,
  [companyId, serviceChargeCategoryName])).rows[0] || null
}

/** Caller owns a transaction. Serialize first-time saves/issuance within this company. */
export async function ensureServiceChargeCategory(db: any, companyId: string, actor: string) {
  await serviceLock(db, companyId)
  let category = await readServiceChargeCategory(db, companyId)
  if (!category) {
    category = { id: randomUUID(), name: serviceChargeCategoryName, status: true }
    await db.query(`INSERT INTO categories(id,company_id,name,status,tax_type,updated_at)
      VALUES($1,$2,$3,true,'FIXED',now())`, [category.id, companyId, category.name])
    await serviceAudit(db, companyId, category.id, actor, 'CHARGE_CATEGORY_CREATED', 'Created category for service charges', null, category)
  } else if (!category.status) {
    await db.query('UPDATE categories SET status=true,updated_at=now() WHERE id=$1 AND company_id=$2', [category.id, companyId])
    await serviceAudit(db, companyId, category.id, actor, 'CHARGE_CATEGORY_RESTORED', 'Restored category for service charges', category, { ...category, status: true })
    category = { ...category, status: true }
  }
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    VALUES($1,$2,'after-sales','service-charge-category',$3::jsonb,true)
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=excluded.preference_value,active=true
    WHERE general_preferences.preference_value IS DISTINCT FROM excluded.preference_value OR NOT general_preferences.active`,
  [randomUUID(), companyId, JSON.stringify({ version: 1, categoryId: category.id })])
  return category
}

/** Restrict the override to non-stock lines; product lines retain their own category. */
export async function applyServiceChargeCategory(db: any, companyId: string, entries: any[], categoryId: string) {
  const category = (await db.query('SELECT id FROM categories WHERE id=$1 AND company_id=$2 AND status=true FOR SHARE', [categoryId, companyId])).rows[0]
  if (!category) throw serviceError('Select an active service charge category belonging to this company.', 400)
  for (const entry of entries) if (!entry.variant?.connect?.id && !entry.item?.connect?.id)
    entry.category = { connect: { id: category.id } }
}
