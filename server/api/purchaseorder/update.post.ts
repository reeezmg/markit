import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { selectDistributorAccounts } from '../../utils/distributor-account-selection';
import { updatePurchaseAccounting } from '../../utils/purchase-accounting-update';
import { ensurePurchaseOrderSource, createPurchaseOrderPayment } from '../../utils/purchase-order-source';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'


// Raw-SQL atomic replacement for add.vue's saveEditedPurchaseInfo +
// syncEditedPurchasePayment (PO edit flow). The PO is the purchase source;
// existing payments and standalone credits are preserved.
export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const body = await readBody(event)
  const { poId, payment = {} } = body || {}
  if (!poId) throw createError({ statusCode: 400, statusMessage: 'Missing poId' })

  const {
    paymentType = null, billNo = null, distributorId = null,
    totalAmount = 0, subTotalAmount = 0, discount = 0, tax = 0, adjustment = 0, createdAt,
  } = payment

  const newType = paymentType || null
  const hasNew = newType !== null
  if (hasNew && !distributorId) throw createError({ statusCode: 400, statusMessage: 'Distributor is required for purchase payment' })

  const createdAtDate = createdAt ? new Date(createdAt) : new Date()
  const TRANSIENT_ERROR_CODES = ['40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001']

  async function runTransaction(attempt = 1): Promise<any> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await lockCompanyRequest(event, client);
      const previous = (await client.query('SELECT * FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [poId,companyId])).rows[0];
      if (!previous) throw createError({statusCode:404,statusMessage:'Purchase order not found'});
      const oldType=previous.payment_type;
      const allocated=(await client.query('SELECT payment_id,amount FROM distributor_payment_allocations WHERE purchase_order_id=$1 AND company_id=$2',[poId,companyId])).rows;
      const payments=(await client.query('SELECT id,expense_id FROM distributor_payments WHERE company_id=$2 AND (purchase_order_id=$1 OR id=ANY($3::text[]))',[poId,companyId,allocated.map((a:any)=>a.payment_id)])).rows;
      if (allocated.length && Number(totalAmount) < allocated.reduce((sum:number,a:any)=>sum+Number(a.amount),0)) throw createError({statusCode:409,statusMessage:'Purchase total cannot be below its allocated payments. Edit payment allocations first.'});
      if (distributorId && previous.distributor_id && distributorId!==previous.distributor_id && payments.length) throw createError({statusCode:409,statusMessage:'This purchase has payments. Reverse its payments before changing distributor.'});
      if (payments.length && oldType!==newType) throw createError({statusCode:409,statusMessage:'Edit payments separately before changing the purchase payment method.'});

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

      await ensurePurchaseOrderSource(client, companyId, poId)
      const newPaymentId = newType && newType !== 'CREDIT' && !payments.length
        ? await createPurchaseOrderPayment(client, companyId, poId) : null
      if (distributorId) {
        await selectDistributorAccounts(client,companyId,distributorId,`purchase:${poId}`,payment.accountingAccounts);
        if (newPaymentId) await selectDistributorAccounts(client,companyId,distributorId,`payment:${newPaymentId}`,payment.accountingAccounts);
      }
      await updatePurchaseAccounting(client, companyId, poId)
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
  } catch (error: any) {
    if (error.statusCode) throw error;
    if (error.code==='P0001') throw createError({statusCode:400,statusMessage:error.message});
    throw createError({ statusCode: 500, statusMessage: 'Failed to update purchase order' })
  }
})
