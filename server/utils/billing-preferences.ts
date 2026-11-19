import { randomUUID } from 'node:crypto'
import { emptyBillingPreferences, normalizeBillingPreferences, type BillingDocumentKind, type BillingPreferences } from '../../utils/billing-preferences'

export const billingPreferenceRoles = ['admin', 'manager', 'accountant']
const page = (kind: BillingDocumentKind) => kind === 'invoice' ? 'invoices' : 'sales'
export async function readBillingPreferences(db: any, companyId: string, kind: BillingDocumentKind) {
  const row = (await db.query(`SELECT preference_value FROM general_preferences WHERE company_id=$1 AND page_name=$2 AND preference_key='defaults' AND active=true`, [companyId, page(kind)])).rows[0]
  return { preferences: row ? normalizeBillingPreferences(row.preference_value, kind) : emptyBillingPreferences(kind), configured: Boolean(row) }
}
/** Caller holds the company lock and transaction. Preserve the preceding JSON. */
export async function saveBillingPreferences(db: any, companyId: string, kind: BillingDocumentKind, value: BillingPreferences) {
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    SELECT $2,company_id,$3,'defaults-backup',preference_value,true FROM general_preferences
    WHERE company_id=$1 AND page_name=$3 AND preference_key='defaults'
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [companyId, randomUUID(), page(kind)])
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    VALUES($1,$2,$3,'defaults',$4::jsonb,true)
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [randomUUID(), companyId, page(kind), JSON.stringify(value)])
}
