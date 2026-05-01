import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id as string
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const client = await pool.connect()
  try {
    const headerRes = await client.query(
      `SELECT
         pr.id, pr.return_no, pr.created_at, pr.subtotal_amount, pr.tax_amount,
         pr.total_amount, pr.remarks, pr.purchase_order_id, pr.distributor_id,
         po.purchase_order_no,
         d.name AS distributor_name
       FROM purchase_returns pr
       LEFT JOIN purchase_orders po ON po.id = pr.purchase_order_id
       JOIN distributors d          ON d.id  = pr.distributor_id
       WHERE pr.id = $1 AND pr.company_id = $2`,
      [id, companyId]
    )
    if (headerRes.rows.length === 0)
      throw createError({ statusCode: 404, statusMessage: 'Purchase return not found' })

    const h = headerRes.rows[0]

    const itemsRes = await client.query(
      `SELECT
         pri.id, pri.item_id, pri.variant_id, pri.barcode,
         COALESCE(NULLIF(pri.product_name, ''), c.name) AS product_name,
         pri.size, pri.qty, pri.rate, pri.tax, pri.tax_amount, pri.subtotal, pri.reason,
         pri.category_id, c.name AS category_name
       FROM purchase_return_items pri
       LEFT JOIN categories c ON c.id = pri.category_id
       WHERE pri.purchase_return_id = $1
       ORDER BY pri.created_at`,
      [id]
    )

    return {
      id: h.id,
      returnNo: h.return_no,
      createdAt: h.created_at,
      subTotalAmount: Number(h.subtotal_amount),
      taxAmount: Number(h.tax_amount),
      totalAmount: Number(h.total_amount),
      remarks: h.remarks ?? '',
      purchaseOrderId: h.purchase_order_id,
      purchaseOrderNo: h.purchase_order_no,
      distributorId: h.distributor_id,
      distributorName: h.distributor_name,
      items: itemsRes.rows.map(r => ({
        id: r.id,
        itemId: r.item_id,
        variantId: r.variant_id,
        barcode: r.barcode ?? '',
        productName: r.product_name,
        size: r.size ?? '',
        qty: Number(r.qty),
        rate: Number(r.rate),
        tax: Number(r.tax),
        taxAmount: Number(r.tax_amount),
        subtotal: Number(r.subtotal),
        reason: r.reason ?? '',
        categoryId: r.category_id ?? null,
        categoryName: r.category_name ?? null,
      })),
    }
  } finally {
    client.release()
  }
})
