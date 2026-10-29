import { selectDistributorAccounts } from '../../utils/distributor-account-selection';
import { ensurePurchaseOrderSource, createPurchaseOrderPayment } from '../../utils/purchase-order-source';
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { linkPurchaseProducts, purchaseProductIds } from '~/server/utils/purchase-product-links'
import { recalculatePurchaseOrderTotals } from '~/server/utils/purchase-order-totals'


// Raw-SQL atomic replacement for add.vue's handleSaveWithPO (create flow):
// increment purchase_counter, create the PO (app-owned number = counter-1, matching
// the existing flow — the assign_purchase_order_number trigger no-ops because the
// number is already set), link draft products, and post the PO header as purchase.
// Credit POs create no DC. An explicitly paid PO creates one numbered DP.
export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const body = await readBody(event)
  const { productIds = [], payment = {} } = body || {}
  const selectedProductIds = purchaseProductIds(productIds)
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
      await lockCompanyRequest(event, client);

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

      if (selectedProductIds.length) {
        await linkPurchaseProducts(client, companyId, poId, selectedProductIds)
        await recalculatePurchaseOrderTotals(client, { companyId, poId })
      }

      await ensurePurchaseOrderSource(client, companyId, poId)
      await createPurchaseOrderPayment(client, companyId, poId)

      if (payment?.distributorId) {
        await selectDistributorAccounts(client,companyId,payment.distributorId,`purchase:${poId}`,payment.accountingAccounts);
        const linked = await client.query('SELECT id FROM distributor_payments WHERE company_id=$1 AND purchase_order_id=$2',[companyId,poId]);
        for(const row of linked.rows) await selectDistributorAccounts(client,companyId,payment.distributorId,`payment:${row.id}`,payment.accountingAccounts);
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
  } catch (error: any) {
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: 'Failed to save purchase order' })
  }
})
