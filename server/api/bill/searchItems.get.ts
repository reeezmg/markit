import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { quoteProductSearchQuery } from '../../utils/quote-product-search'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = quoteProductSearchQuery(companyId, getQuery(event))

  if (!query.q) return []

  const client = await pool.connect()

  try {
    const { rows } = await client.query(query.sql, query.values)

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
        brand: r.variant_brand_name ? { name: r.variant_brand_name } : null,
        product: {
          name: r.product_name,
          categoryId: r.category_id,
          brand: r.brand_name ? { name: r.brand_name } : null,
          collection: r.collection_name ? { name: r.collection_name } : null,
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
