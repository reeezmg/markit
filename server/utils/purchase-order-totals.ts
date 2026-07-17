import { distributorPaymentLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

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

  if (po.payment_type === 'CREDIT') {
    await client.query(
      `UPDATE distributor_credits SET amount = $3
       WHERE purchase_order_id = $1 AND company_id = $2`,
      [input.poId, input.companyId, total],
    )
  } else if (po.payment_type) {
    // A normal PO creates one full-payment row. If later payment history contains
    // multiple rows, preserve those real partial payments instead of multiplying
    // the new order total across every row.
    const payments = await client.query(
      `SELECT id, payment_type, created_at, remarks
       FROM distributor_payments
       WHERE purchase_order_id = $1 AND company_id = $2
       ORDER BY created_at, id
       FOR UPDATE`,
      [input.poId, input.companyId],
    )
    if (payments.rows.length === 1) {
      const payment = payments.rows[0]
      await client.query(
        `UPDATE distributor_payments SET amount = $3
         WHERE id = $1 AND company_id = $2`,
        [payment.id, input.companyId, total],
      )
      await rebuildAccountLedgerForSource(client, {
        companyId: input.companyId,
        sourceType: 'DISTRIBUTOR_PAYMENT',
        sourceId: payment.id,
        rows: distributorPaymentLedgerRows({
          id: payment.id,
          companyId: input.companyId,
          amount: total,
          paymentType: payment.payment_type,
          createdAt: payment.created_at,
          remarks: payment.remarks || `Purchase order ${input.poId}`,
        }),
      })
    }
  }

  return { subtotalAmount: subtotal, totalAmount: total }
}
