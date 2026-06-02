import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    payload,     // Product fields
    variants,    // Array of variants with images + items
    companyId,
    poId,
    category,
    subcategory,
    categoryTax,
    deliveryType,
    productId: providedProductId, // optional: caller-supplied id (keeps client draft tracking consistent)
  } = body

  const TRANSIENT_ERROR_CODES = [
    '40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001'
  ]

  async function logError(error: any, requestData: any) {
    const client = await pool.connect()
    try {
      await client.query(
        `INSERT INTO save_error_requests (id, created_at, company_id, request_data, error_message)
         VALUES ($1, now(), $2, $3, $4)`,
        [
          crypto.randomUUID(),
          companyId,
          JSON.stringify(requestData),
          error.message || 'Unknown error'
        ]
      )
    } catch (logErr) {
      console.error('⚠️ Failed to log error:', logErr.message)
    } finally {
      client.release()
    }
  }

  async function runTransaction(attempt = 1): Promise<any> {
    const client = await pool.connect()
    const productId = providedProductId || crypto.randomUUID()

    try {
      await client.query("BEGIN")

      // =============================
      //  1️⃣ INSERT PRODUCT
      // =============================
      const insertProductSQL = `
        INSERT INTO products (
          id, name, brand_id, description, status, company_id, purchaseorder_id,
          category_id, subcategory_id, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
      `
      await client.query(insertProductSQL, [
        productId,
        payload.name || '',
        payload.brandId || payload.brand || null,
        payload.description || '',
        payload.status ?? true,
        companyId,
        poId,
        category?.id || null,
        subcategory || null
      ])

      // =============================
      //  2️⃣ INSERT VARIANTS + ITEMS (batched: one multi-row INSERT each)
      // =============================
      function taxFor(sprice: number) {
        if (!categoryTax) return 0
        if (categoryTax.taxType === 'FIXED') return categoryTax.fixedTax || 0
        if (categoryTax.taxType === 'VARIABLE') {
          const threshold = categoryTax.thresholdAmount || 0
          return (sprice || 0) > threshold ? (categoryTax.taxAboveThreshold || 0) : (categoryTax.taxBelowThreshold || 0)
        }
        return 0
      }

      const dt = deliveryType || 'trynbuy'
      const allItems: any[] = []

      if (variants.length) {
        const VC = 12 // params per variant row (delivery_type shared param appended after)
        const vVals: any[] = []
        const vRows = variants.map((variant: any, i: number) => {
          const variantId = crypto.randomUUID()
          const imageUUIDs = (variant.images || [])
            .sort((a: any, b: any) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
            .map((file: any) => (typeof file === 'string' ? file : file.uuid))
          for (const size of (variant.items || [])) {
            allItems.push({ id: crypto.randomUUID(), size: size.size || null, qty: size.qty || 0, variantId })
          }
          const base = i * VC
          vVals.push(
            variantId, variant.name || '', variant.code || null, variant.unit || 'Nos',
            variant.sprice || 0, variant.pprice || 0, variant.dprice || 0, variant.discount || 0,
            taxFor(variant.sprice), imageUUIDs, companyId, productId,
          )
          const p = Array.from({ length: VC }, (_, k) => `$${base + k + 1}`)
          // id,name,code,unit,s_price,p_price,d_price,discount,delivery_type,status,tax,images,company_id,product_id
          return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},${p[6]},${p[7]},$${variants.length * VC + 1},true,${p[8]},${p[9]},${p[10]},${p[11]},now(),now())`
        })
        await client.query(
          `INSERT INTO variants(
             id, name, code, unit, s_price, p_price, d_price,
             discount, delivery_type, status, tax, images,
             company_id, product_id, created_at, updated_at
           ) VALUES ${vRows.join(',')}`,
          [...vVals, dt],
        )
      }

      if (allItems.length) {
        const IC = 6
        const iVals: any[] = []
        const iRows = allItems.map((it, i) => {
          const base = i * IC
          // initial_qty seeded to qty on create (captures purchase stock)
          iVals.push(it.id, it.size, it.qty, it.qty, companyId, it.variantId)
          const p = Array.from({ length: IC }, (_, k) => `$${base + k + 1}`)
          return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},now(),now())`
        })
        await client.query(
          `INSERT INTO items(id, size, qty, initial_qty, company_id, variant_id, created_at, updated_at)
           VALUES ${iRows.join(',')}`,
          iVals,
        )
      }

      await client.query("COMMIT")
      client.release()

      return { success: true, productId }

    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()

      console.error(`❌ Transaction attempt ${attempt} failed:`, error.message)
      logError(error, body)

      if (TRANSIENT_ERROR_CODES.includes(error.code) && attempt < 3) {
        const delay = 200 * Math.pow(2, attempt - 1)
        console.log(`🔁 Retrying in ${delay}ms...`)
        await new Promise((res) => setTimeout(res, delay))
        return runTransaction(attempt + 1)
      }

      throw error
    }
  }

  try {
    const response = await runTransaction()
    return response
  } catch {
    throw createError({ statusCode: 500, statusMessage: "Failed to create product after retries" })
  }
})
