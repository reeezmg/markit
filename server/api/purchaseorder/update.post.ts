import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

// Raw-SQL atomic replacement for add.vue's saveEditedPurchaseInfo +
// syncEditedPurchasePayment (PO edit flow). Mirrors the credit/payment transition
// matrix exactly (create / delete / update many keyed by purchase_order_id) then
// updates the PO row — all in one transaction.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const body = await readBody(event)
  const { poId, payment = {} } = body || {}
  if (!poId) throw createError({ statusCode: 400, statusMessage: 'Missing poId' })

  const {
    paymentType = null, oldPaymentType = null, billNo = null, distributorId = null,
    totalAmount = 0, subTotalAmount = 0, discount = 0, tax = 0, adjustment = 0, createdAt,
  } = payment

  const newType = paymentType || null
  const oldType = oldPaymentType || null
  const isNewCredit = newType === 'CREDIT'
  const wasOldCredit = oldType === 'CREDIT'
  const hasNew = newType !== null
  const hasOld = oldType !== null
  if (hasNew && !distributorId) throw createError({ statusCode: 400, statusMessage: 'Distributor is required for purchase payment' })

  const createdAtDate = createdAt ? new Date(createdAt) : new Date()
  const TRANSIENT_ERROR_CODES = ['40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001']

  const insertCredit = (client: any) => client.query(
    `INSERT INTO distributor_credits (id, created_at, amount, "billNo", distributor_id, company_id, purchase_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), createdAtDate, totalAmount || 0, billNo || null, distributorId, companyId, poId],
  )
  const insertPayment = (client: any) => client.query(
    `INSERT INTO distributor_payments (id, created_at, amount, payment_type, distributor_id, company_id, purchase_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), createdAtDate, totalAmount || 0, newType, distributorId, companyId, poId],
  )

  async function runTransaction(attempt = 1): Promise<any> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // --- payment transition matrix (keyed by purchase_order_id) ---
      if (hasNew && !hasOld) {
        if (isNewCredit) await insertCredit(client); else await insertPayment(client)
      } else if (!hasNew && hasOld) {
        if (wasOldCredit) await client.query(`DELETE FROM distributor_credits WHERE purchase_order_id = $1`, [poId])
        else await client.query(`DELETE FROM distributor_payments WHERE purchase_order_id = $1`, [poId])
      } else if (isNewCredit && wasOldCredit) {
        await client.query(
          `UPDATE distributor_credits SET amount = $2, "billNo" = $3, created_at = $4 WHERE purchase_order_id = $1`,
          [poId, totalAmount || 0, billNo || null, createdAtDate],
        )
      } else if (!isNewCredit && wasOldCredit) {
        await client.query(`DELETE FROM distributor_credits WHERE purchase_order_id = $1`, [poId])
        if (hasNew) await insertPayment(client)
      } else if (!isNewCredit && !wasOldCredit && hasNew) {
        await client.query(
          `UPDATE distributor_payments SET amount = $2, payment_type = $3, created_at = $4 WHERE purchase_order_id = $1`,
          [poId, totalAmount || 0, newType, createdAtDate],
        )
      } else if (isNewCredit && !wasOldCredit) {
        await client.query(`DELETE FROM distributor_payments WHERE purchase_order_id = $1`, [poId])
        await insertCredit(client)
      }

      // --- PO row ---
      await client.query(
        `UPDATE purchase_orders SET
           payment_type = $2,
           bill_no = $3,
           distributor_id = COALESCE($4, distributor_id),
           created_at = $5,
           total_amount = $6,
           subtotal_amount = $7,
           discount = $8,
           tax = $9,
           adjustment = $10,
           updated_at = now()
         WHERE id = $1 AND company_id = $11`,
        [
          poId, newType, billNo || null, distributorId || null, createdAtDate,
          totalAmount || subTotalAmount || 0, subTotalAmount || 0, discount || 0, tax || 0, adjustment || 0, companyId,
        ],
      )

      await client.query('COMMIT')
      client.release()
      return { success: true, poId }
    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()
      console.error(`❌ PO update attempt ${attempt} failed:`, error.message)
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
    throw createError({ statusCode: 500, statusMessage: 'Failed to update purchase order' })
  }
})
