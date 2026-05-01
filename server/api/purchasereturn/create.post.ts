import { pool } from '~/server/db'
import crypto from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const sessionCompanyId = session.data.companyId
  if (!sessionCompanyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const {
    distributorId,
    companyId,
    purchaseOrderId,
    remarks,
    subTotalAmount,
    taxAmount,
    totalAmount,
    items,
  } = body

  if (companyId !== sessionCompanyId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  if (!distributorId || !items?.length)
    throw createError({ statusCode: 400, statusMessage: 'distributorId and items are required' })

  const TRANSIENT_ERROR_CODES = [
    '40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001',
  ]

  async function logError(error: any, requestData: any) {
    const c = await pool.connect()
    try {
      await c.query(
        `INSERT INTO save_error_requests (id, created_at, company_id, request_data, error_message)
         VALUES ($1, now(), $2, $3, $4)`,
        [crypto.randomUUID(), companyId, JSON.stringify(requestData), error.message || 'Unknown error']
      )
    } catch (logErr: any) {
      console.error('⚠️ Failed to log error:', logErr.message)
    } finally {
      c.release()
    }
  }

  async function runTransaction(attempt = 1) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const returnId = crypto.randomUUID()

      /* 1. Atomically increment return_counter and get the value */
      const counterRes = await client.query(
        `UPDATE companies SET return_counter = return_counter + 1
         WHERE id = $1 RETURNING return_counter`,
        [companyId]
      )
      const returnNo = counterRes.rows[0].return_counter

      /* 2. Insert purchase_returns header */
      await client.query(
        `INSERT INTO purchase_returns (
           id, return_no, subtotal_amount, tax_amount, total_amount, remarks,
           purchase_order_id, distributor_id, company_id, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [
          returnId,
          returnNo,
          subTotalAmount || 0,
          taxAmount || 0,
          totalAmount || 0,
          remarks || null,
          purchaseOrderId || null,
          distributorId,
          companyId,
        ]
      )

      /* 2. Insert purchase_return_items */
      await Promise.all(
        items.map((item: any) =>
          client.query(
            `INSERT INTO purchase_return_items (
               id, item_id, variant_id, barcode, product_name, size,
               qty, rate, tax, tax_amount, subtotal, reason, category_id, purchase_return_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              crypto.randomUUID(),
              item.barcode?.trim() ? (item.itemId || null) : null,
              item.barcode?.trim() ? (item.variantId || null) : null,
              item.barcode?.trim() ? (item.barcode || null) : null,
              item.productName || item.categoryName || '',
              item.size || null,
              item.qty,
              item.rate,
              item.tax || 0,
              item.taxAmount || 0,
              item.subtotal,
              item.reason || null,
              item.categoryId || null,
              returnId,
            ]
          )
        )
      )

      /* 3. Decrease stock for each returned item */
      await Promise.all(
        items.map((item: any) =>
          item.barcode?.trim() && item.itemId
            ? client.query(
              `UPDATE items SET qty = COALESCE(qty, 0) - $1 WHERE id = $2`,
              [item.qty, item.itemId]
            )
            : Promise.resolve()
        )
      )

      /* 4. Insert distributor_payments with RETURN type to reduce totalDue */
      await client.query(
        `INSERT INTO distributor_payments (
           id, payment_type, amount, remarks, distributor_id, company_id, purchase_return_id
         ) VALUES ($1, 'RETURN', $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          totalAmount || 0,
          remarks || null,
          distributorId,
          companyId,
          returnId,
        ]
      )

      await client.query('COMMIT')
      client.release()
      return { success: true, purchaseReturnId: returnId }
    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()

      console.error(`❌ Purchase return transaction attempt ${attempt} failed:`, error.message)
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
    return await runTransaction()
  } catch (error: any) {
    console.error('🚨 Final failure after retries:', error.message)
    logError(error, body)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create purchase return after retries' })
  }
})
