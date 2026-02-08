import { Pool } from 'pg'
import crypto from 'crypto'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const {
    payload, // Prisma-style payload from frontend
    items,
    returnedItems,
    billPoints,
    clientId,
    companyId,
    couponId,
  } = body
  console.log(body)
  const TRANSIENT_ERROR_CODES = [
    '40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001'
  ]

  async function logError(error: any, requestData: any) {
    const client = await pool.connect()
    try {
      client.query(
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

  async function runTransaction(attempt = 1) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Generate Bill ID
      const billId = crypto.randomUUID()

      // 1️⃣ Insert Bill — Prisma-style fields flattened
      const insertBillQuery = `
        INSERT INTO bills (
          id, invoice_number, subtotal, discount, grand_total, return_amt,
          payment_method, redeemed_points, bill_points, created_at,
          payment_status, type, split_payments, company_id, account_id,
          client_id, user_id, updated_at, coupon_value
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, now(), $18
        )
      `

      await client.query(insertBillQuery, [
        billId,
        payload.invoiceNumber || null,
        payload.subtotal || 0,
        payload.discount || 0,
        payload.grandTotal || 0,
        payload.returnAmt || 0,
        payload.paymentMethod || 'Cash',
        payload.redeemedPoints || 0,
        payload.billPoints || 0,
        new Date(payload.createdAt),
        payload.paymentStatus || 'PAID',
        payload.type || 'BILL',
        payload.splitPayments ? JSON.stringify(payload.splitPayments) : null,
        payload.company.connect?.id || companyId,
        payload.account?.connect?.id || null,
        payload.client?.connect?.id || null,
        payload.companyUser?.connect?.companyId_userId?.userId || null,
        payload.couponValue
      ])

      // 2️⃣ Insert Entries (payload.entries.create)
      if (payload.entries?.create?.length) {
        const entryInserts = payload.entries.create.map((entry: any) => {
          const entryId = crypto.randomUUID()
          return client.query(
            `
              INSERT INTO entries (
                id, name, qty, rate, discount, tax, value, size, barcode,
                return, variant_id, item_id, category_id, company_id, user_id, bill_id, user_name
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17
              )
            `,
            [
              entryId,
              entry.name || '',
              entry.qty || 1,
              entry.rate || 0,
              entry.discount || 0,
              entry.tax || 0,
              entry.value || 0,
              entry.size || null,
              entry.barcode || null,
              entry.return || false,
              entry.variant?.connect?.id || null,
              entry.item?.connect?.id || null,
              entry.category?.connect?.id || null,
              companyId,
              entry.companyUser?.connect?.companyId_userId?.userId || null,
              billId,
              entry.userName || null
            ]
          )
        })
        await Promise.all(entryInserts)
      }

      // 3️⃣ Parallel updates (client points, stock, returns, etc.)
      const updatePromises: Promise<any>[] = []

      if (clientId) {
        updatePromises.push(
          client.query(
            `UPDATE company_clients SET points = points + $1 WHERE company_id = $2 AND client_id = $3`,
            [billPoints, companyId, clientId]
          )
        )
      }

      // stock updates
      for (const item of items) {
        if (!item.return) {
          if (item.variantId)
            updatePromises.push(
              client.query(
                `UPDATE items SET sold_qty = COALESCE(sold_qty, 0) + $1 WHERE id = $2`,
                [item.qty, item.id]
              )
            )
          if (item.id)
            updatePromises.push(
              client.query(
                `UPDATE items SET qty = COALESCE(qty, 0) - $1 WHERE id = $2`,
                [item.qty, item.id]
              )
            )
        }
      }

      // returned stock
      for (const item of returnedItems) {
        if (item.variantId)
          updatePromises.push(
            client.query(
              `UPDATE items SET sold_qty = COALESCE(sold_qty, 0) - $1 WHERE id = $2`,
              [item.qty, item.id]
            )
          )
        if (item.id)
          updatePromises.push(
            client.query(
              `UPDATE items SET qty = COALESCE(qty, 0) + $1 WHERE id = $2`,
              [item.qty, item.id]
            )
          )
      }

      // coupon usage + increment
      if (couponId && clientId) {
        const usageId = crypto.randomUUID()
        updatePromises.push(
          client.query(
            `INSERT INTO coupon_usages (id, coupon_id, client_id, bill_id, used_at)
             VALUES ($1, $2, $3, $4, now())`,
            [usageId, couponId, clientId, billId]
          )
        )
        updatePromises.push(
          client.query(
            `UPDATE coupons SET times_used = times_used + 1 WHERE id = $1`,
            [couponId]
          )
        )
      }

      // increment bill counter
      updatePromises.push(
        client.query(
          `UPDATE companies SET bill_counter = bill_counter + 1 WHERE id = $1`,
          [companyId]
        )
      )

      await Promise.all(updatePromises)

      await client.query('COMMIT')
      client.release()
      return { success: true, billId }
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
    const result = await runTransaction()
    return result
  } catch (error) {
    console.error('🚨 Final failure after retries:', error.message)
    logError(error, body)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create bill after retries' })
  }
})
