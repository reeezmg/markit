import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { recalculatePurchaseOrderTotals } from '~/server/utils/purchase-order-totals'

// Atomic batch save for the deferred add-products flow: the client stages N
// products locally (variable + localStorage) and calls this once on Save.
// Everything happens in ONE transaction — all products + variants + items in
// batched multi-row inserts, plus optional purchase order + PO-linked
// credit/payment. Either the whole batch commits (client then resets staged
// products) or it rolls back (client keeps them as-is).
//
// Body: {
//   products: [{ id?, name, brandId, description, status, categoryId, subcategoryId,
//                deliveryType, categoryTax, variants: [{ id?, name, code, unit,
//                sprice, pprice, dprice, discount, images:[uuid], items:[{id?,size,qty}] }] }],
//   po?:   { paymentType, billNo, distributorId, totalAmount, subTotalAmount,
//            discount, tax, adjustment, createdAt },   // create a new PO + link
//   poId?: string,                                     // OR link to an existing PO
// }
// Returns { success, productIds, poId, purchaseOrderNo, products:[…with barcodes] }
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const body = await readBody(event)
  const { products = [], po = null, poId: existingPoId = null } = body || {}
  if (!Array.isArray(products) || !products.length) {
    throw createError({ statusCode: 400, statusMessage: 'No products to save' })
  }

  const TRANSIENT_ERROR_CODES = ['40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001']

  function taxFor(categoryTax: any, sprice: number) {
    if (!categoryTax) return 0
    if (categoryTax.taxType === 'FIXED') return categoryTax.fixedTax || 0
    if (categoryTax.taxType === 'VARIABLE') {
      const threshold = categoryTax.thresholdAmount || 0
      return (sprice || 0) > threshold ? (categoryTax.taxAboveThreshold || 0) : (categoryTax.taxBelowThreshold || 0)
    }
    return 0
  }

  // multi-row VALUES builder: rows = array of param arrays (all same length),
  // literals = trailing literal SQL appended to every row (e.g. "now(),now()")
  function multiRow(rows: any[][], literalsSql: string) {
    const flat: any[] = []
    const cols = rows[0].length
    const tuples = rows.map((row, i) => {
      const base = i * cols
      row.forEach((v) => flat.push(v))
      const ph = Array.from({ length: cols }, (_, k) => `$${base + k + 1}`).join(',')
      return `(${ph}${literalsSql ? ',' + literalsSql : ''})`
    })
    return { sql: tuples.join(','), params: flat }
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
    const createdAtDate = po?.createdAt ? new Date(po.createdAt) : new Date()
    try {
      await client.query('BEGIN')

      // 1) optional purchase order (app-owned number = counter-1, matching add flow)
      let poId: string | null = existingPoId || null
      let purchaseOrderNo: number | null = null
      if (po) {
        poId = crypto.randomUUID()
        const counterRes = await client.query(
          `UPDATE companies SET purchase_counter = purchase_counter + 1 WHERE id = $1 RETURNING purchase_counter`,
          [companyId],
        )
        purchaseOrderNo = (counterRes.rows[0]?.purchase_counter || 1) - 1
        await client.query(
          `INSERT INTO purchase_orders (
             id, created_at, updated_at, company_id, payment_type, total_amount,
             distributor_id, bill_no, adjustment, discount, tax, subtotal_amount, purchase_order_no
           ) VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            poId, createdAtDate, companyId, po.paymentType || null,
            po.totalAmount || po.subTotalAmount || 0, po.distributorId || null, po.billNo || null,
            po.adjustment || 0, po.discount || 0, po.tax || 0, po.subTotalAmount || 0, purchaseOrderNo,
          ],
        )
      }

      // 2) assign ids, then batch-insert all products / variants / items
      const productRows: any[][] = []
      const variantRows: any[][] = []
      const itemRows: any[][] = []
      const productIds: string[] = []
      let returnedVariants: any[] = []
      let returnedItems: any[] = []

      for (const p of products) {
        const productId = p.id || crypto.randomUUID()
        productIds.push(productId)
        productRows.push([
          productId, p.name || '', p.brandId || null, p.description || '',
          typeof p.status === 'boolean' ? p.status : true, companyId, poId,
          p.categoryId || p.category?.id || null, p.subcategoryId || null,
          p.collectionId || p.collection?.id || null,
          p.weight ?? null, p.length ?? null, p.width ?? null, p.height ?? null,
          p.dimensionId ?? null,
        ])
        const dt = p.deliveryType || 'trynbuy'
        for (const v of (p.variants || [])) {
          const variantId = v.id || crypto.randomUUID()
          const images = (v.images || [])
            .slice()
            .sort((a: any, b: any) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
            .map((f: any) => (typeof f === 'string' ? f : f.uuid))
          variantRows.push([
            variantId, v.name || '', v.code || null, v.unit || 'Nos',
            v.sprice || 0, v.pprice || 0, v.dprice || 0, v.discount || 0,
            dt, taxFor(p.categoryTax, v.sprice), images, companyId, productId,
            v.weight ?? null, v.length ?? null, v.width ?? null, v.height ?? null,
          ])
          for (const it of (v.items || [])) {
            itemRows.push([
              it.id || crypto.randomUUID(), it.size || null, it.qty || 0, it.qty || 0, companyId, variantId,
              it.weight ?? null, it.length ?? null, it.width ?? null, it.height ?? null,
              it.dimensionId ?? null,
            ])
          }
        }
      }

      {
        const { sql, params } = multiRow(productRows, 'now(),now()')
        await client.query(
          `INSERT INTO products (id, name, brand_id, description, status, company_id, purchaseorder_id, category_id, subcategory_id, collection_id, weight, length, width, height, dimension_id, created_at, updated_at) VALUES ${sql}`,
          params,
        )
      }
      if (variantRows.length) {
        const { sql, params } = multiRow(variantRows, 'true,now(),now()')
        // columns: id,name,code,unit,s_price,p_price,d_price,discount,delivery_type,tax,images,company_id,product_id,weight,status,created_at,updated_at
        const variantsRes = await client.query(
          `INSERT INTO variants (id, name, code, unit, s_price, p_price, d_price, discount, delivery_type, tax, images, company_id, product_id, weight, length, width, height, status, created_at, updated_at)
           VALUES ${sql}
           RETURNING id, name, code, unit, s_price, p_price, d_price, discount, weight, product_id`,
          params,
        )
        returnedVariants = variantsRes.rows
      }
      if (itemRows.length) {
        const { sql, params } = multiRow(itemRows, 'now(),now()')
        const itemsRes = await client.query(
          `INSERT INTO items (id, size, qty, initial_qty, company_id, variant_id, weight, length, width, height, dimension_id, created_at, updated_at)
           VALUES ${sql}
           RETURNING id, barcode, size, qty, variant_id`,
          params,
        )
        returnedItems = itemsRes.rows
      }

      // 3) PO-linked credit/payment (no money_transaction → no cash/bank ledger cascade)
      if (po && po.paymentType && po.distributorId) {
        if (po.paymentType === 'CREDIT') {
          await client.query(
            `INSERT INTO distributor_credits (id, created_at, amount, "billNo", distributor_id, company_id, purchase_order_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [crypto.randomUUID(), createdAtDate, po.totalAmount || 0, po.billNo || null, po.distributorId, companyId, poId],
          )
        } else {
          await client.query(
            `INSERT INTO distributor_payments (id, created_at, amount, payment_type, distributor_id, company_id, purchase_order_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [crypto.randomUUID(), createdAtDate, po.totalAmount || 0, po.paymentType, po.distributorId, companyId, poId],
          )
        }
      }

      if (poId) {
        await recalculatePurchaseOrderTotals(client, { companyId, poId })
      }

      // 4) read back product names; variant/item rows already came from INSERT ... RETURNING.
      const prodMetaRes = await client.query(
        `SELECT p.id, p.name, c.name AS category_name, b.name AS brand_name, s.name AS subcategory_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN subcategories s ON s.id = p.subcategory_id
         WHERE p.id = ANY($1::text[])`,
        [productIds],
      )

      await client.query('COMMIT')
      client.release()

      const itemsByVariant = new Map<string, any[]>()
      for (const it of returnedItems) {
        const list = itemsByVariant.get(it.variant_id) || []
        list.push({ id: it.id, barcode: it.barcode, size: it.size, qty: it.qty })
        itemsByVariant.set(it.variant_id, list)
      }
      const variantsByProduct = new Map<string, any[]>()
      for (const v of returnedVariants) {
        const list = variantsByProduct.get(v.product_id) || []
        list.push({
          id: v.id, name: v.name, code: v.code, sprice: v.s_price, dprice: v.d_price,
          items: itemsByVariant.get(v.id) || [],
        })
        variantsByProduct.set(v.product_id, list)
      }
      const resultProducts = prodMetaRes.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category: { name: p.category_name },
        brand: { name: p.brand_name },
        subcategory: { name: p.subcategory_name },
        variants: variantsByProduct.get(p.id) || [],
      }))

      return { success: true, productIds, poId, purchaseOrderNo, products: resultProducts }
    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()
      console.error(`❌ save-batch attempt ${attempt} failed:`, error.message)
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
    throw createError({ statusCode: 500, statusMessage: 'Failed to save products' })
  }
})
