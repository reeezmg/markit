import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const q = String(query.q || query.search || '').trim()
  const limit = Math.min(Math.max(Number(query.limit || 3), 1), 10)

  if (!q) return []

  const client = await pool.connect()

  try {
    const { rows } = await client.query(
      `
      SELECT
        i.id AS item_id,
        i.barcode,
        i.size,
        i.qty,

        v.id AS variant_id,
        v.name AS variant_name,
        v.unit,
        v.s_price AS sprice,
        v.d_price AS dprice,
        v.p_price AS pprice,
        v.tax,
        v.discount,

        p.name AS product_name,
        p.category_id,

        sc.name AS subcategory_name,

        c.name AS category_name,
        c.tax_type,
        c.fixed_tax,
        c.threshold_amount,
        c.tax_below_threshold,
        c.tax_above_threshold
      FROM items i
      INNER JOIN variants v ON v.id = i.variant_id
      INNER JOIN products p ON p.id = v.product_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE i.company_id = $1
        AND COALESCE(i.qty, 0) > 0
        AND COALESCE(v.status, true) = true
        AND COALESCE(p.status, true) = true
        AND (
          i.barcode ILIKE $2
          OR p.name ILIKE $2
          OR v.name ILIKE $2
          OR sc.name ILIKE $2
        )
      ORDER BY
        CASE
          WHEN i.barcode = $3 THEN 0
          WHEN i.barcode ILIKE $4 THEN 1
          WHEN p.name ILIKE $4 THEN 2
          WHEN v.name ILIKE $4 THEN 3
          ELSE 4
        END,
        COALESCE(i.qty, 0) DESC,
        p.name ASC,
        v.name ASC
      LIMIT $5;
      `,
      [companyId, `%${q}%`, q, `${q}%`, limit]
    )

    return rows.map((r) => ({
      id: r.item_id,
      barcode: r.barcode,
      size: r.size,
      qty: r.qty,
      variant: {
        id: r.variant_id,
        name: r.variant_name,
        unit: r.unit,
        sprice: Number(r.sprice),
        dprice: Number(r.dprice),
        tax: Number(r.tax),
        discount: Number(r.discount),
        pprice: Number(r.pprice),
        product: {
          name: r.product_name,
          categoryId: r.category_id,
          subcategory: r.subcategory_name ? { name: r.subcategory_name } : null,
          category: r.category_id
            ? {
                id: r.category_id,
                name: r.category_name,
                taxType: r.tax_type,
                fixedTax: r.fixed_tax,
                thresholdAmount: r.threshold_amount,
                taxBelowThreshold: r.tax_below_threshold,
                taxAboveThreshold: r.tax_above_threshold,
              }
            : null,
        },
      },
    }))
  } finally {
    client.release()
  }
})
