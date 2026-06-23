import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { distributorPaymentLedgerRows, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

// Raw-SQL atomic replacement for add.vue's handleSaveWithPO (create flow):
// increment purchase_counter, create the PO (app-owned number = counter-1, matching
// the existing flow — the assign_purchase_order_number trigger no-ops because the
// number is already set), link draft products, and create the PO-linked
// DistributorCredit (CREDIT) or DistributorPayment (other types). PO-linked rows
// carry no money_transaction, so there is no cash/bank ledger cascade here.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const body = await readBody(event)
  const { productIds = [], payment = {} } = body || {}
  const {
    paymentType = null, billNo = null, distributorId = null,
    totalAmount = 0, subTotalAmount = 0, discount = 0, tax = 0, adjustment = 0, createdAt,
  } = payment

  const TRANSIENT_ERROR_CODES = ['40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001']
  const createdAtDate = createdAt ? new Date(createdAt) : new Date()

  async function runTransaction(attempt = 1): Promise<any> {
    const client = await pool.connect()
    const poId = crypto.randomUUID()
    try {
      await client.query('BEGIN')

      // app-owned PO number (matches add.vue: increment then use counter-1)
      const counterRes = await client.query(
        `UPDATE companies SET purchase_counter = purchase_counter + 1 WHERE id = $1 RETURNING purchase_counter`,
        [companyId],
      )
      const purchaseOrderNo = (counterRes.rows[0]?.purchase_counter || 1) - 1

      await client.query(
        `INSERT INTO purchase_orders (
           id, created_at, updated_at, company_id, payment_type, total_amount,
           distributor_id, bill_no, adjustment, discount, tax, subtotal_amount, purchase_order_no
         ) VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          poId, createdAtDate, companyId, paymentType || null,
          totalAmount || subTotalAmount || 0, distributorId || null, billNo || null,
          adjustment || 0, discount || 0, tax || 0, subTotalAmount || 0, purchaseOrderNo,
        ],
      )

      if (productIds.length) {
        await client.query(
          `UPDATE products SET purchaseorder_id = $1, updated_at = now()
           WHERE id = ANY($2::text[]) AND company_id = $3`,
          [poId, productIds, companyId],
        )
      }

      if (paymentType && distributorId) {
        if (paymentType === 'CREDIT') {
          await client.query(
            `INSERT INTO distributor_credits (id, created_at, amount, "billNo", distributor_id, company_id, purchase_order_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [crypto.randomUUID(), createdAtDate, totalAmount || 0, billNo || null, distributorId, companyId, poId],
          )
        } else {
          const paymentId = crypto.randomUUID()
          await client.query(
            `INSERT INTO distributor_payments (id, created_at, amount, payment_type, distributor_id, company_id, purchase_order_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [paymentId, createdAtDate, totalAmount || 0, paymentType, distributorId, companyId, poId],
          )
          await rebuildAccountLedgerForSource(client, {
            companyId,
            sourceType: 'DISTRIBUTOR_PAYMENT',
            sourceId: paymentId,
            rows: distributorPaymentLedgerRows({
              id: paymentId,
              companyId,
              amount: totalAmount || 0,
              paymentType,
              createdAt: createdAtDate,
              remarks: `Purchase order ${purchaseOrderNo}`,
            }),
          })
        }
      }

      await client.query('COMMIT')
      client.release()
      return { success: true, poId, purchaseOrderNo }
    } catch (error: any) {
      await client.query('ROLLBACK')
      client.release()
      console.error(`❌ PO save attempt ${attempt} failed:`, error.message)
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
    throw createError({ statusCode: 500, statusMessage: 'Failed to save purchase order' })
  }
})
