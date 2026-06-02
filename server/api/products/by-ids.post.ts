import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

// Raw-SQL replacement for useFindManyProduct(draftProductsQuery) on add.vue —
// returns the draft product rows (by id, company-scoped) with brand/category/
// subcategory + variants + items, in the camelCase shape the table/barcode code expects.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const { ids = [] } = (await readBody(event)) || {}
  if (!Array.isArray(ids) || !ids.length) return []

  const client = await pool.connect()
  try {
    const prodRes = await client.query(
      `SELECT p.id, p.name, p.description, p.status, p.brand_id, p.category_id, p.subcategory_id,
              p.purchaseorder_id,
              c.name AS category_name, c.target_audience AS category_target_audience,
              b.name AS brand_name, s.name AS subcategory_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN subcategories s ON s.id = p.subcategory_id
       WHERE p.id = ANY($1::text[]) AND p.company_id = $2
       ORDER BY p.created_at ASC`,
      [ids, companyId],
    )
    const productIds = prodRes.rows.map((p) => p.id)

    const variantsByProduct = new Map<string, any[]>()
    const itemsByVariant = new Map<string, any[]>()
    if (productIds.length) {
      const vRes = await client.query(
        `SELECT id, name, code, unit, s_price, p_price, d_price, discount, images, product_id
         FROM variants WHERE product_id = ANY($1::text[]) ORDER BY created_at ASC`,
        [productIds],
      )
      const variantIds = vRes.rows.map((v) => v.id)
      for (const v of vRes.rows) {
        const list = variantsByProduct.get(v.product_id) || []
        list.push(v)
        variantsByProduct.set(v.product_id, list)
      }
      if (variantIds.length) {
        const iRes = await client.query(
          `SELECT id, barcode, size, qty, initial_qty, variant_id
           FROM items WHERE variant_id = ANY($1::text[]) ORDER BY created_at ASC`,
          [variantIds],
        )
        for (const it of iRes.rows) {
          const list = itemsByVariant.get(it.variant_id) || []
          list.push({ id: it.id, barcode: it.barcode, size: it.size, qty: it.qty, initialQty: it.initial_qty })
          itemsByVariant.set(it.variant_id, list)
        }
      }
    }

    return prodRes.rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      brandId: p.brand_id,
      categoryId: p.category_id,
      subcategoryId: p.subcategory_id,
      purchaseorderId: p.purchaseorder_id,
      category: p.category_id ? { id: p.category_id, name: p.category_name, targetAudience: p.category_target_audience } : null,
      brand: p.brand_id ? { id: p.brand_id, name: p.brand_name } : null,
      subcategory: p.subcategory_id ? { id: p.subcategory_id, name: p.subcategory_name } : null,
      variants: (variantsByProduct.get(p.id) || []).map((v) => ({
        id: v.id, name: v.name, code: v.code, unit: v.unit,
        sprice: v.s_price, pprice: v.p_price, dprice: v.d_price, discount: v.discount,
        images: v.images || [], items: itemsByVariant.get(v.id) || [],
      })),
    }))
  } finally {
    client.release()
  }
})
