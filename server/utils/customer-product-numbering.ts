import { customerProductReference, defaultProductReferencePrefix, productReferencePrefix } from '../../utils/customer-product-numbering'
import { serviceAudit, serviceError } from './after-sales-lifecycle'

export const productNumberingRoles = ['admin', 'manager', 'accountant']
export async function productNumberingAvailable(db: any) {
  return !!(await db.query(`SELECT to_regclass('public.customer_product_numbering') IS NOT NULL
    AND EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.customer_products_company_id_reference_key') AND indisvalid AND indisunique)
    AND to_regclass('public.customer_products_reference_key') IS NULL AS ready`)).rows[0]?.ready
}
export async function readProductNumbering(db: any, companyId: string) {
  const available = await productNumberingAvailable(db)
  const row = available ? (await db.query('SELECT prefix,last_number::text FROM customer_product_numbering WHERE company_id=$1', [companyId])).rows[0] : null
  const prefix = row?.prefix || defaultProductReferencePrefix, nextNumber = (BigInt(row?.last_number || 0) + 1n).toString()
  return { prefix, nextNumber, nextReference: customerProductReference(prefix, nextNumber), available }
}
export async function saveProductNumbering(db: any, companyId: string, actor: string, value: unknown) {
  let prefix: string
  try { prefix = productReferencePrefix(value) } catch (e: any) { throw serviceError(e.message, 400) }
  if (!await productNumberingAvailable(db)) throw serviceError('Product reference numbering requires the prepared product reference numbering migration.', 503)
  await db.query('INSERT INTO customer_product_numbering(company_id,updated_at) VALUES($1,now()) ON CONFLICT(company_id) DO NOTHING', [companyId])
  const before = (await db.query('SELECT prefix,last_number::text FROM customer_product_numbering WHERE company_id=$1 FOR UPDATE', [companyId])).rows[0]
  await db.query('UPDATE customer_product_numbering SET prefix=$2,updated_at=now() WHERE company_id=$1', [companyId, prefix])
  await serviceAudit(db, companyId, companyId, actor, 'PRODUCT_REFERENCE_PREFIX_CHANGED', 'Changed client product reference prefix', before, { ...before, prefix })
  return readProductNumbering(db, companyId)
}
/** Existing schemas keep legacy registration working until the authorized install. */
export async function nextCustomerProductReference(db: any, companyId: string, id: string) {
  if (!await productNumberingAvailable(db)) return 'MP-' + id
  await db.query('INSERT INTO customer_product_numbering(company_id,updated_at) VALUES($1,now()) ON CONFLICT(company_id) DO NOTHING', [companyId])
  const row = (await db.query('SELECT prefix,last_number::text FROM customer_product_numbering WHERE company_id=$1 FOR UPDATE', [companyId])).rows[0]
  let number = BigInt(row.last_number), reference: string
  do {
    number++
    if (number > 9223372036854775807n) throw serviceError('Product reference counter is exhausted.')
    reference = customerProductReference(row.prefix, number.toString())
  } while ((await db.query('SELECT 1 FROM customer_products WHERE company_id=$1 AND reference=$2', [companyId, reference])).rowCount)
  await db.query('UPDATE customer_product_numbering SET last_number=$2,updated_at=now() WHERE company_id=$1', [companyId, number.toString()])
  return reference
}
