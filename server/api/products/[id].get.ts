import { defineEventHandler, getRouterParam, createError } from 'h3'
import { pool } from '~/server/db'

// Raw-SQL replacement for useFindUniqueProduct on the edit page.
// Returns the product with brand/category/subcategory + variants + items,
// mapped to the camelCase shape the page expects from ZenStack.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing product id' })

  const client = await pool.connect()
  try {
    const productRes = await client.query(
      `SELECT p.id, p.updated_at, p.name, p.description, p.status,
              p.category_id, p.subcategory_id, p.brand_id,
              c.name AS category_name, c.target_audience AS category_target_audience,
              b.name AS brand_name,
              s.name AS subcategory_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN subcategories s ON s.id = p.subcategory_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [id, companyId],
    )
    if (!productRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
    const p = productRes.rows[0]

    const variantsRes = await client.query(
      `SELECT id, name, code, unit, s_price, p_price, d_price, discount, images
       FROM variants WHERE product_id = $1 ORDER BY created_at ASC`,
      [id],
    )
    const variantIds = variantsRes.rows.map((v) => v.id)

    const itemsByVariant = new Map<string, any[]>()
    if (variantIds.length) {
      const itemsRes = await client.query(
        `SELECT id, barcode, size, qty, variant_id
         FROM items WHERE variant_id = ANY($1::text[]) ORDER BY created_at ASC`,
        [variantIds],
      )
      for (const it of itemsRes.rows) {
        const list = itemsByVariant.get(it.variant_id) || []
        list.push({ id: it.id, barcode: it.barcode, size: it.size, qty: it.qty })
        itemsByVariant.set(it.variant_id, list)
      }
    }

    return {
      id: p.id,
      updatedAt: p.updated_at,
      name: p.name,
      description: p.description,
      status: p.status,
      categoryId: p.category_id,
      subcategoryId: p.subcategory_id,
      brandId: p.brand_id,
      category: p.category_id ? { id: p.category_id, name: p.category_name, targetAudience: p.category_target_audience } : null,
      brand: p.brand_id ? { id: p.brand_id, name: p.brand_name } : null,
      subcategory: p.subcategory_id ? { id: p.subcategory_id, name: p.subcategory_name } : null,
      variants: variantsRes.rows.map((v) => ({
        id: v.id,
        name: v.name,
        code: v.code,
        unit: v.unit,
        sprice: v.s_price,
        pprice: v.p_price,
        dprice: v.d_price,
        discount: v.discount,
        images: v.images || [],
        items: itemsByVariant.get(v.id) || [],
      })),
    }
  } finally {
    client.release()
  }
})
