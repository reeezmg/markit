import { createError } from 'h3'
import { applyBillStock } from './bill-stock'
import { generateCouponsForBill } from './generatedCoupons'
import { creditAmountFromBill, upsertUserLedgerEntry } from './user-ledger'

/** Source writes only. Caller owns the transaction, ownership locks and retry receipt.
 * Invoice numbering and native accounting remain owned by the installed triggers.
 */
export async function createBillSource(db: any, body: any) {
  const payload = body.payload || {}
  const companyId = body.companyId
  const billId = body.uuid
  if (!billId || !companyId || (payload.company?.connect?.id && payload.company.connect.id !== companyId))
    throw createError({ statusCode: 400, statusMessage: 'A bill ID and matching company are required' })

  let clientId = payload.client?.connect?.id || null
  if (clientId && !(await db.query('SELECT 1 FROM clients WHERE id=$1', [clientId])).rowCount) clientId = null
  const couponId = clientId ? body.couponId || null : null
  const redeemedPoints = clientId ? Number(payload.redeemedPoints || 0) : 0
  const billPoints = clientId ? Number(body.billPoints || 0) : 0
  const inserted = await db.query(`
    WITH p AS (SELECT $1::jsonb AS data)
    INSERT INTO bills (
      id, invoice_number, subtotal, discount, discount_type, grand_total, return_amt,
      payment_method, redeemed_points, bill_points, created_at, payment_status,
      type, split_payments, company_id, account_id, credit_user_id, client_id,
      user_id, updated_at, coupon_value
    ) SELECT $2, NULL,
      COALESCE(NULLIF(data->>'subtotal','')::numeric,0),
      COALESCE(NULLIF(data->>'discount','')::numeric,0),
      COALESCE(NULLIF(data->>'discountType',''),'percentage'),
      COALESCE(NULLIF(data->>'grandTotal','')::numeric,0),
      COALESCE(NULLIF(data->>'returnAmt','')::numeric,0),
      COALESCE(NULLIF(data->>'paymentMethod',''),'Cash'), $5, $6,
      COALESCE(NULLIF(data->>'createdAt','')::timestamp,now()),
      COALESCE(NULLIF(data->>'paymentStatus',''),'PAID')::"PaymentStatus",
      COALESCE(NULLIF(data->>'type',''),'BILL')::"OrderType",
      CASE WHEN jsonb_typeof(data->'splitPayments')='array' THEN data->'splitPayments' END,
      $3, NULLIF(data #>> '{account,connect,id}',''), NULLIF(data->>'creditUserId',''), $4,
      NULLIF(data #>> '{companyUser,connect,companyId_userId,userId}',''), now(),
      NULLIF(data->>'couponValue','')::integer
    FROM p RETURNING invoice_number, created_at`,
    [JSON.stringify(payload), billId, companyId, clientId, redeemedPoints, billPoints])
  const bill = inserted.rows[0]

  await db.query(`INSERT INTO entries (
      id, name, qty, rate, discount, tax, value, size, barcode, return,
      variant_id, item_id, category_id, company_id, user_id, bill_id, user_name
    ) SELECT gen_random_uuid()::text, COALESCE(entry->>'name',''),
      COALESCE(NULLIF(entry->>'qty','')::numeric,1),
      COALESCE(NULLIF(entry->>'rate','')::numeric,0),
      COALESCE(NULLIF(entry->>'discount','')::numeric,0),
      COALESCE(NULLIF(entry->>'tax','')::numeric,0),
      COALESCE(NULLIF(entry->>'value','')::numeric,0),
      NULLIF(entry->>'size',''), NULLIF(entry->>'barcode',''),
      COALESCE((entry->>'return')::boolean,false),
      NULLIF(entry #>> '{variant,connect,id}',''), NULLIF(entry #>> '{item,connect,id}',''),
      NULLIF(entry #>> '{category,connect,id}',''), $2,
      NULLIF(entry #>> '{companyUser,connect,companyId_userId,userId}',''), $3,
      NULLIF(entry->>'userName','')
    FROM jsonb_array_elements($1::jsonb) AS e(entry)`,
    [JSON.stringify(payload.entries?.create || []), companyId, billId])

  if (payload.creditUserId) await upsertUserLedgerEntry(db, {
    companyId, userId: payload.creditUserId, type: 'USER_CREDIT_BILL', direction: 'DEBIT',
    amount: creditAmountFromBill(payload), sourceType: 'BILL', sourceId: billId,
    note: 'Bill credit' + (bill.invoice_number != null ? ` #${bill.invoice_number}` : ''),
    createdAt: bill.created_at,
  })

  if (clientId && (billPoints || redeemedPoints)) {
    const updated = await db.query(`UPDATE company_clients SET points=COALESCE(points,0)+$3-$4
      WHERE company_id=$1 AND client_id=$2 AND COALESCE(points,0)>=$4 RETURNING client_id`,
      [companyId, clientId, billPoints, redeemedPoints])
    if (!updated.rowCount) throw createError({ statusCode: 409, statusMessage: 'Insufficient points or client not found' })
  }

  // Derive physical stock effects from the entries actually saved, as delete/restore do.
  await applyBillStock(db, billId, companyId, true)

  if (couponId && clientId) {
    const coupon = (await db.query('SELECT audience_type FROM coupons WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [couponId, companyId])).rows[0]
    if (!coupon) throw createError({ statusCode: 409, statusMessage: 'Coupon not found in this company' })
    if (coupon.audience_type === 'GENERATE') {
      const voucher = await db.query(`UPDATE coupon_clients SET usage_limit=COALESCE(usage_limit,0)-1
        WHERE id=(SELECT id FROM coupon_clients WHERE coupon_id=$1 AND client_id=$2
          AND COALESCE(usage_limit,0)>0 ORDER BY "createdAt" ASC LIMIT 1) RETURNING id`, [couponId, clientId])
      if (!voucher.rowCount) throw createError({ statusCode: 409, statusMessage: 'No remaining uses for this generated coupon' })
    }
    await db.query(`WITH used AS (INSERT INTO coupon_usages(id,coupon_id,client_id,bill_id,used_at)
      VALUES(gen_random_uuid()::text,$1,$2,$3,now()))
      UPDATE coupons SET times_used=times_used+1 WHERE id=$1`, [couponId, clientId, billId])
  }

  const generatedCoupons = await generateCouponsForBill(db, {
    companyId, clientId, billId, grandTotal: Number(payload.grandTotal || 0), billDate: bill.created_at,
  })
  return { success: true, billId, invoiceNumber: bill.invoice_number, generatedCoupons }
}
