import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

// Raw-SQL replacement for the nested useUpdateProduct (upsert + deleteMany) used
// by the product edit page. One transaction: update product, prune removed
// variants/items, upsert the rest. New items get barcodes from the set_item_barcode
// BEFORE INSERT trigger; existing items keep theirs (ON CONFLICT DO UPDATE).
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const body = await readBody(event)
  const { productId, product = {}, variants = [], categoryTax = null, updateImages = false } = body || {}
  if (!productId) throw createError({ statusCode: 400, statusMessage: 'Missing productId' })

  const TRANSIENT_ERROR_CODES = ['40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001']

  function taxFor(sprice: number) {
    if (!categoryTax) return 0
    if (categoryTax.taxType === 'FIXED') return categoryTax.fixedTax || 0
    if (categoryTax.taxType === 'VARIABLE') {
      const threshold = categoryTax.thresholdAmount || 0
      return (sprice || 0) > threshold ? (categoryTax.taxAboveThreshold || 0) : (categoryTax.taxBelowThreshold || 0)
    }
    return 0
  }

  async function logError(error: any) {
    const client = await pool.connect()
    try {
      await client.query(
        `INSERT INTO save_error_requests (id, created_at, company_id, request_data, error_message)
         VALUES ($1, now(), $2, $3, $4)`,
        [crypto.randomUUID(), companyId, JSON.stringify(body), error.message || 'Unknown error'],
      )
    } catch (e: any) {
      console.error('⚠️ Failed to log error:', e.message)
    } finally {
      client.release()
    }
  }

  async function runTransaction(attempt = 1): Promise<any> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1) product row (COALESCE keeps existing when a field isn't supplied — mirrors
      //    the page only connecting brand/category/subcategory when chosen)
      const upd = await client.query(
        `UPDATE products SET
           name = $3,
           description = $4,
           status = COALESCE($5, status),
           brand_id = COALESCE($6, brand_id),
           category_id = COALESCE($7, category_id),
           subcategory_id = COALESCE($8, subcategory_id),
           updated_at = now()
         WHERE id = $1 AND company_id = $2`,
        [
          productId,
          companyId,
          product.name || '',
          product.description || '',
          typeof product.status === 'boolean' ? product.status : null,
          product.brandId || null,
          product.categoryId || null,
          product.subcategoryId || null,
        ],
      )
      if (!upd.rowCount) throw new Error('Product not found for this company')

      // 2) prune removed variants (cascades their items)
      const keepVariantIds = variants.map((v: any) => v.id).filter(Boolean)
      await client.query(
        `DELETE FROM variants WHERE product_id = $1 AND company_id = $2 AND NOT (id = ANY($3::text[]))`,
        [productId, companyId, keepVariantIds],
      )

      // 3) upsert all variants in ONE multi-row statement
      if (variants.length) {
        const VC = 12 // params per variant row
        const vVals: any[] = []
        const vRows = variants.map((v: any, i: number) => {
          const base = i * VC
          const images = (v.images || [])
            .slice()
            .sort((a: any, b: any) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
            .map((f: any) => (typeof f === 'string' ? f : f.uuid))
          vVals.push(
            v.id, v.name || '', v.code || null, v.unit || 'Nos',
            v.sprice || 0, v.pprice || 0, v.dprice || 0, v.discount || 0,
            taxFor(v.sprice), updateImages ? images : [], companyId, productId,
          )
          const p = Array.from({ length: VC }, (_, k) => `$${base + k + 1}`)
          // id,name,code,unit,s_price,p_price,d_price,discount,status,tax,images,company_id,product_id,delivery_type
          return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},${p[6]},${p[7]},true,${p[8]},${p[9]},${p[10]},${p[11]},'trynbuy',now(),now())`
        })
        const updImgParam = `$${variants.length * VC + 1}`
        await client.query(
          `INSERT INTO variants (
             id, name, code, unit, s_price, p_price, d_price, discount, status, tax,
             images, company_id, product_id, delivery_type, created_at, updated_at
           ) VALUES ${vRows.join(',')}
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, code = EXCLUDED.code, unit = EXCLUDED.unit,
             s_price = EXCLUDED.s_price, p_price = EXCLUDED.p_price, d_price = EXCLUDED.d_price,
             discount = EXCLUDED.discount, status = true, tax = EXCLUDED.tax,
             images = CASE WHEN ${updImgParam}::boolean THEN EXCLUDED.images ELSE variants.images END,
             updated_at = now()`,
          [...vVals, updateImages],
        )
      }

      // 4) prune removed items across the kept variants, then upsert all items in ONE statement
      const allItems = variants.flatMap((v: any) => (v.items || []).map((it: any) => ({ ...it, variantId: v.id })))
      const keepItemIds = allItems.map((it: any) => it.id).filter(Boolean)
      await client.query(
        `DELETE FROM items WHERE variant_id = ANY($1::text[]) AND NOT (id = ANY($2::text[]))`,
        [keepVariantIds, keepItemIds],
      )
      if (allItems.length) {
        const IC = 6 // params per item row
        const iVals: any[] = []
        const iRows = allItems.map((it: any, i: number) => {
          const base = i * IC
          // initial_qty seeded to qty for NEW items; on conflict it is NOT touched,
          // so an existing item's initial_qty (its original purchase stock) is preserved.
          iVals.push(it.id || crypto.randomUUID(), it.size || null, it.qty || 0, it.qty || 0, companyId, it.variantId)
          const p = Array.from({ length: IC }, (_, k) => `$${base + k + 1}`)
          return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},now(),now())`
        })
        await client.query(
          `INSERT INTO items (id, size, qty, initial_qty, company_id, variant_id, created_at, updated_at)
           VALUES ${iRows.join(',')}
           ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, qty = EXCLUDED.qty, updated_at = now()`,
          iVals,
        )
      }

      await client.query('COMMIT')
      client.release()
      return { success: true, productId }
    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()
      console.error(`❌ Product update attempt ${attempt} failed:`, error.message)
      logError(error)
      if (TRANSIENT_ERROR_CODES.includes(error.code) && attempt < 3) {
        await new Promise((res) => setTimeout(res, 200 * Math.pow(2, attempt - 1)))
        return runTransaction(attempt + 1)
      }
      throw error
    }
  }

  try {
    return await runTransaction()
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update product after retries' })
  }
})
