import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

/**
 * Product picker for a manually created order.
 *
 * Searches down to the ITEM, not the product: an item is the smallest thing
 * that holds stock (one size of one variant) and it is what an order line
 * points at, so the seller has to pick one before a line means anything.
 *
 * Only live stock is offered — an inactive product, an inactive variant or a
 * sold-out size cannot be added to an order by hand any more than it can be
 * bought on the storefront.
 *
 * GET /api/ecommerce-cms/orders/product-search?q=hijab
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const q = String(getQuery(event).q || '').trim()
  const pattern = `%${q}%`

  const { rows } = await pool.query(
    `SELECT i.id                AS "itemId",
            i.size,
            i.barcode,
            COALESCE(i.qty, 0)  AS stock,
            v.id                AS "variantId",
            v.name              AS "variantName",
            v.s_price           AS "sprice",
            COALESCE(v.d_price, v.s_price) AS "dprice",
            COALESCE(v.tax, 0)  AS tax,
            v.images,
            COALESCE(v.size_label, 'Size') AS "sizeLabel",
            v.weight,
            p.name              AS "productName",
            p.category_id       AS "categoryId"
     FROM items i
     JOIN variants v ON v.id = i.variant_id AND v.company_id = $1 AND v.status = true
     JOIN products p ON p.id = v.product_id AND p.company_id = $1 AND p.status = true
     WHERE i.company_id = $1
       AND COALESCE(i.qty, 0) > 0
       AND ($2 = '' OR p.name ILIKE $3 OR v.name ILIKE $3 OR i.barcode ILIKE $3)
     ORDER BY p.name, v.name, i.size
     LIMIT 50`,
    [companyId, q, pattern],
  )

  return { products: rows }
})
