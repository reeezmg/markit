import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  /* -------------------------------
     AUTH
  -------------------------------- */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  /* -------------------------------
     QUERY
  -------------------------------- */
  const query = getQuery(event)
  const barcode = query.barcode

  if (!barcode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'barcode is required',
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        i.id                     AS item_id,
        i.size,
        i.qty,

        v.id                     AS variant_id,
        v.name                   AS variant_name,
        v.s_price                AS sprice,
        v.d_price                AS dprice,
        v.tax,
        v.discount,

        p.name                   AS product_name,
        p.category_id,

        sc.name                  AS subcategory_name,

        c.tax_type,
        c.fixed_tax,
        c.threshold_amount,
        c.tax_below_threshold,
        c.tax_above_threshold

      FROM items i
      INNER JOIN variants v       ON v.id = i.variant_id
      INNER JOIN products p       ON p.id = v.product_id
      LEFT JOIN subcategories sc  ON sc.id = p.subcategory_id
      LEFT JOIN categories c      ON c.id = p.category_id

      WHERE i.barcode = $1
        AND i.company_id = $2
        AND COALESCE(i.qty, 0) > 0

      LIMIT 1;
      `,
      [barcode, companyId]
    )

    if (res.rows.length === 0) {
      return null
    }

    const r = res.rows[0]

    /* -------------------------------
       TRANSFORM (Prisma-like shape)
    -------------------------------- */
    return {
      id: r.item_id,
      size: r.size,
      qty: r.qty,

      variant: {
        id: r.variant_id,
        name: r.variant_name,
        sprice: Number(r.sprice),
        dprice: Number(r.dprice),
        tax: Number(r.tax),
        discount: Number(r.discount),

        product: {
          name: r.product_name,
          categoryId: r.category_id,

          subcategory: r.subcategory_name
            ? { name: r.subcategory_name }
            : null,

          category: r.category_id
            ? {
                taxType: r.tax_type,
                fixedTax: r.fixed_tax,
                thresholdAmount: r.threshold_amount,
                taxBelowThreshold: r.tax_below_threshold,
                taxAboveThreshold: r.tax_above_threshold,
              }
            : null,
        },
      },
    }
  } finally {
    client.release()
  }
})
