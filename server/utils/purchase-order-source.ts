import { randomUUID } from 'node:crypto';

/** Register the PO header as the source using the installed accounting mechanism.
 * Call inside the source transaction, before its deferred posting runs. No DDL.
 */
export async function ensurePurchaseOrderSource(db: any, companyId: string, poId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:' || $1))", [companyId]);
  const po = (await db.query('SELECT * FROM purchase_orders WHERE company_id=$1 AND id=$2 FOR UPDATE', [companyId, poId])).rows[0];
  if (!po) throw new Error('Purchase order not found for this company');
  const approved = await db.query(`SELECT 1 FROM accountant_v2_accountant_audit WHERE company_id=$1
    AND resource='purchase-order-header-authority' AND "resourceId"=$2`, [companyId, poId]);
  if (!approved.rowCount) {
    const defaults = (await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1
      AND resource='account-defaults' AND action='configured' AND "resourceId"='purchase' AND deleted_at IS NULL
      ORDER BY created_at DESC,id DESC LIMIT 1`, [companyId])).rows[0]?.after || {};
    await db.query(`INSERT INTO accountant_v2_accountant_audit
      (id,company_id,"userId",action,resource,"resourceId","after",updated_at)
      VALUES($1,$2,COALESCE(nullif(current_setting('app.accountant_user',true),''),'purchase-source'),
        'configured','purchase-order-header-authority',$3,$4::jsonb,now())`,
    [randomUUID(), companyId, poId, JSON.stringify({ accounts: defaults, source: 'purchase-order', reason: 'PO is the purchase source; credits are standalone' })]);
  }
  return po;
}

/** An explicitly paid new PO records its payment once. PO edits never reset it. */
export async function createPurchaseOrderPayment(db: any, companyId: string, poId: string) {
  const po = (await db.query('SELECT * FROM purchase_orders WHERE company_id=$1 AND id=$2 FOR UPDATE', [companyId, poId])).rows[0];
  if (!po) throw new Error('Purchase order not found for this company');
  if (!po.payment_type || po.payment_type === 'CREDIT' || !po.distributor_id) return null;
  const previous = await db.query(`SELECT id FROM distributor_payments WHERE company_id=$1 AND purchase_order_id=$2
    UNION ALL SELECT payment_id AS id FROM distributor_payment_allocations WHERE company_id=$1 AND purchase_order_id=$2`, [companyId, poId]);
  if (previous.rowCount) return null;
  const number = (await db.query(`UPDATE companies SET distributor_payment_counter=distributor_payment_counter+1
    WHERE id=$1 RETURNING distributor_payment_counter-1 AS number`, [companyId])).rows[0].number;
  const id = randomUUID();
  await db.query(`INSERT INTO distributor_payments
    (id,created_at,amount,payment_type,distributor_id,company_id,purchase_order_id,payment_no)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id,po.created_at,po.total_amount,po.payment_type,po.distributor_id,companyId,poId,number]);
  return id;
}
