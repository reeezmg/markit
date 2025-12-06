import { Pool } from 'pg'
import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

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
    deliveryType
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
    const productId = crypto.randomUUID()

    try {
      await client.query("BEGIN")

      // =============================
      //  1️⃣ INSERT PRODUCT
      // =============================
      const insertProductSQL = `
        INSERT INTO products (
          id, name, brand, description, status, company_id, purchaseorder_id,
          category_id, subcategory_id, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
      `
      await client.query(insertProductSQL, [
        productId,
        payload.name || '',
        payload.brand || '',
        payload.description || '',
        payload.status ?? true,
        companyId,
        poId,
        category?.id || null,
        subcategory || null
      ])

      // =============================
      //  2️⃣ INSERT VARIANTS + ITEMS
      // =============================
      for (const variant of variants) {
        const variantId = crypto.randomUUID()

        // Tax logic
        let tax = 0
        if (categoryTax) {
          if (categoryTax.taxType === "FIXED") {
            tax = categoryTax.fixedTax || 0
          } else if (categoryTax.taxType === "VARIABLE") {
            const threshold = categoryTax.thresholdAmount || 0
            tax = (variant.sprice || 0) > threshold
              ? categoryTax.taxAboveThreshold || 0
              : categoryTax.taxBelowThreshold || 0
          }
        }

        // Images sorted
        const imageUUIDs =
          (variant.images || [])
            .sort((a, b) => (a.view === "front" ? -1 : b.view === "front" ? 1 : 0))
            .map((file) => file.uuid)

        const insertVariantSQL = `
          INSERT INTO variants(
            id, name, code, s_price, p_price, d_price,
            discount, delivery_type, status, tax, images,
            company_id, product_id, created_at, updated_at
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
        `

        await client.query(insertVariantSQL, [
          variantId,
          variant.name || '',
          variant.code || null,
          variant.sprice || 0,
          variant.pprice || 0,
          variant.dprice || 0,
          variant.discount || 0,
          deliveryType || 'trynbuy',
          true,
          tax,
          imageUUIDs,
          companyId,
          productId
        ])

        // Items
        if (variant.items && variant.items.length > 0) {
          for (const size of variant.items) {
            await client.query(
              `INSERT INTO items(id, size, qty, company_id, variant_id, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,now(),now())`,
              [
                crypto.randomUUID(),
                size.size || null,
                size.qty || 0,
                companyId,
                variantId
              ]
            )
          }
        }
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
