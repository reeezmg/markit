import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { customPaymentTerm, invoicePaymentTerms, newPaymentTerm, savedPaymentTerms } from '../../utils/invoice-payment-terms'

export const paymentTermRoles = ['admin', 'manager', 'accountant', 'biller', 'user']

export async function readInvoicePaymentTerms(db: any, companyId: string) {
  const row = (await db.query(`SELECT preference_value FROM general_preferences
    WHERE company_id=$1 AND page_name='billing' AND preference_key='payment-terms' AND active=true`, [companyId])).rows[0]
  return savedPaymentTerms(row?.preference_value)
}

/** Caller holds the company row lock and transaction; preserve the preceding JSON. */
export async function addInvoicePaymentTerm(db: any, companyId: string, input: ReturnType<typeof newPaymentTerm>) {
  const terms = await readInvoicePaymentTerms(db, companyId)
  if ([...invoicePaymentTerms, ...terms, customPaymentTerm].some(term => term.name.toLowerCase() === input.name.toLowerCase())) throw createError({ statusCode: 409, statusMessage: 'A payment term with this name already exists.' })
  if (terms.length >= 100) throw createError({ statusCode: 400, statusMessage: 'This company already has 100 payment terms.' })
  const term = { id: randomUUID(), name: input.name, days: input.days, kind: 'days' as const }
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    SELECT $2,company_id,'billing','payment-terms-backup',preference_value,true FROM general_preferences
    WHERE company_id=$1 AND page_name='billing' AND preference_key='payment-terms'
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [companyId, randomUUID()])
  terms.push(term)
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    VALUES($1,$2,'billing','payment-terms',$3::jsonb,true)
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [randomUUID(), companyId, JSON.stringify({ version: 1, terms })])
  return { term, terms }
}
