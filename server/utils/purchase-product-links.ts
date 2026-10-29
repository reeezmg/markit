import { createError } from 'h3'

export function purchaseProductIds(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== 'string' || !id.trim())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid purchase product selection' })
  }
  return [...new Set(value as string[])].sort()
}

// Call inside the PO save transaction. Lock first, validate the entire selection,
// then attach; a concurrent save cannot steal a product from another PO.
export async function linkPurchaseProducts(client: any, companyId: string, poId: string, ids: string[]) {
  const po = await client.query(
    'SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [poId, companyId],
  )
  if (!po.rows.length) throw createError({ statusCode: 404, statusMessage: 'Purchase order not found' })
  if (!ids.length) return
  const products = await client.query(
    `SELECT id, purchaseorder_id FROM products
     WHERE id=ANY($1::text[]) AND company_id=$2 ORDER BY id FOR UPDATE`, [ids, companyId],
  )
  if (products.rows.length !== ids.length) {
    throw createError({ statusCode: 404, statusMessage: 'One or more selected products were not found in this company' })
  }
  // Already attached to this PO is safe for retries; another PO is never moved.
  if (products.rows.some((p: any) => p.purchaseorder_id && p.purchaseorder_id !== poId)) {
    throw createError({ statusCode: 409, statusMessage: 'A selected product already belongs to another purchase order. Remove it and try again.' })
  }
  await client.query(
    `UPDATE products SET purchaseorder_id=$1, updated_at=now()
     WHERE id=ANY($2::text[]) AND company_id=$3 AND purchaseorder_id IS NULL`, [poId, ids, companyId],
  )
}
