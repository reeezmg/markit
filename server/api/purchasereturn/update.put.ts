import { pool } from '~/server/db'
import crypto from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const sessionCompanyId = session.data.companyId
  if (!sessionCompanyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const {
    id,
    distributorId,
    companyId,
    purchaseOrderId,
    remarks,
    returnDate,
    subTotalAmount,
    taxAmount,
    totalAmount,
    items,
  } = body

  if (companyId !== sessionCompanyId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  if (!id || !distributorId || !items?.length)
    throw createError({ statusCode: 400, statusMessage: 'id, distributorId and items are required' })

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

      /* 1. Verify the return belongs to this company */
      const checkRes = await client.query(
        `SELECT id FROM purchase_returns WHERE id = $1 AND company_id = $2`,
        [id, companyId]
      )
      if (checkRes.rows.length === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Purchase return not found' })
      }

      /* 2. Fetch existing items so we can reverse their stock impact */
      const oldItemsRes = await client.query(
        `SELECT item_id, qty FROM purchase_return_items WHERE purchase_return_id = $1`,
        [id]
      )

      /* 3. Reverse old stock decrements (add qty back) */
      await Promise.all(
        oldItemsRes.rows.map((item: any) =>
          item.item_id
            ? client.query(
              `UPDATE items SET qty = COALESCE(qty, 0) + $1 WHERE id = $2`,
              [item.qty, item.item_id]
            )
            : Promise.resolve()
        )
      )

      /* 4. Delete old items */
      await client.query(
        `DELETE FROM purchase_return_items WHERE purchase_return_id = $1`,
        [id]
      )

      /* 5. Update header */
      await client.query(
        `UPDATE purchase_returns
         SET subtotal_amount = $1, tax_amount = $2, total_amount = $3,
             remarks = $4, purchase_order_id = $5, distributor_id = $6,
             created_at = $7, updated_at = now()
         WHERE id = $8 AND company_id = $9`,
        [
          subTotalAmount || 0,
          taxAmount || 0,
          totalAmount || 0,
          remarks || null,
          purchaseOrderId || null,
          distributorId,
          returnDate ? new Date(returnDate) : new Date(),
          id,
          companyId,
        ]
      )

      /* 6. Insert new items */
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
              id,
            ]
          )
        )
      )

      /* 7. Apply new stock decrements */
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

      /* 8. Update the linked distributor payment */
      await client.query(
        `UPDATE distributor_payments
         SET amount = $1, remarks = $2
         WHERE purchase_return_id = $3 AND payment_type = 'RETURN'`,
        [totalAmount || 0, remarks || null, id]
      )

      await client.query('COMMIT')
      client.release()
      return { success: true, purchaseReturnId: id }
    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()

      console.error(`❌ Purchase return update attempt ${attempt} failed:`, error.message)
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
    throw createError({ statusCode: 500, statusMessage: 'Failed to update purchase return after retries' })
  }
})
