import { updatePurchaseAccounting } from './purchase-accounting-update';
import { ensurePurchaseOrderSource } from './purchase-order-source';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export async function recalculatePurchaseOrderTotals(
  client: any,
  input: { companyId: string; poId: string },
) {
  const poRes = await client.query(
    `SELECT id, payment_type, discount, tax, adjustment
     FROM purchase_orders
     WHERE id = $1 AND company_id = $2
     FOR UPDATE`,
    [input.poId, input.companyId],
  )
  const po = poRes.rows[0]
  if (!po) throw new Error('Purchase order not found for this company')

  const subtotalRes = await client.query(
    `SELECT COALESCE(SUM(COALESCE(v.p_price, 0) * COALESCE(i.initial_qty, 0)), 0) AS subtotal
     FROM products p
     JOIN variants v ON v.product_id = p.id AND v.company_id = p.company_id
     JOIN items i ON i.variant_id = v.id AND i.company_id = p.company_id
     WHERE p.purchaseorder_id = $1 AND p.company_id = $2`,
    [input.poId, input.companyId],
  )

  const subtotal = money(Number(subtotalRes.rows[0]?.subtotal || 0))
  const discount = Number(po.discount || 0)
  const discountAmount = discount > 0
    ? subtotal * discount / 100
    : Math.min(Math.abs(discount), subtotal)
  const discountedSubtotal = subtotal - discountAmount
  const total = money(
    discountedSubtotal
      + discountedSubtotal * Number(po.tax || 0) / 100
      + Number(po.adjustment || 0),
  )

  await client.query(
    `UPDATE purchase_orders
     SET subtotal_amount = $3, total_amount = $4, updated_at = now()
     WHERE id = $1 AND company_id = $2`,
    [input.poId, input.companyId, subtotal, total],
  )

  await ensurePurchaseOrderSource(client, input.companyId, input.poId)
  // Purchase totals are independent of actual payments and standalone credits.
  await updatePurchaseAccounting(client, input.companyId, input.poId)
  return { subtotalAmount: subtotal, totalAmount: total }
}
