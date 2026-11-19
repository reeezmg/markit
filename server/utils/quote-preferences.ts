import { randomUUID } from 'node:crypto'
import { emptyQuotePreferences, normalizeQuotePreferences, type QuotePreferences } from '../../utils/quote-preferences'

export async function readQuotePreferences(db: any, companyId: string, page: 'quotes' | 'sales-orders' = 'quotes'): Promise<QuotePreferences> {
  const row = (await db.query(`SELECT preference_value FROM general_preferences
    WHERE company_id=$1 AND page_name=$2 AND preference_key='defaults' AND active=true`, [companyId, page])).rows[0]
  const preferences = row ? normalizeQuotePreferences(row.preference_value) : emptyQuotePreferences()
  if (!row && page === 'sales-orders') preferences.documentDesign.sections.at(-1)!.text = 'Thank you for your order.'
  return preferences
}
export async function saveQuotePreferences(db: any, companyId: string, value: QuotePreferences, page: 'quotes' | 'sales-orders' = 'quotes') {
  // Caller holds the company lock and transaction. Retain the previous saved settings.
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    SELECT $2,company_id,$3,'defaults-backup',preference_value,true FROM general_preferences
    WHERE company_id=$1 AND page_name=$3 AND preference_key='defaults'
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [companyId, randomUUID(), page])
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    VALUES($1,$2,$4,'defaults',$3::jsonb,true)
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [randomUUID(), companyId, JSON.stringify(value), page])
  return value
}
