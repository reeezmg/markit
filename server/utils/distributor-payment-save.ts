import { readBody, createError } from 'h3';
import crypto from 'node:crypto';
import { pool } from '../db';
import { useCompanyRequestSession } from './companyRequestScope';
import { lockCompanyRequest } from './lockCompanyRequest';
import { selectDistributorAccounts } from './distributor-account-selection';

const fail = (message: string, statusCode = 400) => createError({ statusCode, statusMessage: message });
export function paymentParts(body: any) {
  const money = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw fail('Enter positive amounts with at most two decimals');
    return Math.round(n * 100);
  };
  const total = money(body.amount);
  if (body.allocations === undefined) return [{ purchaseOrderId: body.purchaseOrderId || null, amount: total / 100 }];
  if (!Array.isArray(body.allocations) || body.allocations.length > 100) throw fail('Select at most 100 purchase orders');
  if (!body.allocations.length) return [{ purchaseOrderId: null, amount: total / 100 }];
  const ids = new Set<string>();
  const parts = body.allocations.map((part: any) => {
    if (typeof part?.purchaseOrderId !== 'string' || !part.purchaseOrderId || ids.has(part.purchaseOrderId)) throw fail('Choose each purchase order only once');
    ids.add(part.purchaseOrderId);
    return { purchaseOrderId: part.purchaseOrderId, amount: money(part.amount) / 100 };
  });
  if (parts.reduce((sum: number, p: any) => sum + Math.round(p.amount * 100), 0) !== total) throw fail('Allocated amounts must equal the payment total');
  return parts;
}

export async function saveDistributorPayment(event: any, existingId?: string) {
  const session = await useCompanyRequestSession(event);
  const companyId = session.data?.companyId;
  if (!companyId) throw fail('Unauthorized', 401);
  const body = await readBody<any>(event);
  const parts = paymentParts(body);
  const mode = body.paymentType || 'CASH';
  if (!['CASH', 'BANK', 'UPI', 'CARD', 'CHEQUE'].includes(mode)) throw fail('Enter a valid payment mode');
  const date = body.createdAt || body.date ? new Date(body.createdAt || body.date) : new Date();
  if (!Number.isFinite(date.getTime())) throw fail('Invalid payment date');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await lockCompanyRequest(event, db);
    // All allocation saves for a company serialize before reading current dues.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:' || $1))", [companyId]);
    const existing = existingId ? (await db.query('SELECT id,expense_id,distributor_id FROM distributor_payments WHERE id=$1 AND company_id=$2 AND purchase_return_id IS NULL FOR UPDATE', [existingId, companyId])).rows[0] : null;
    if (existingId && !existing) throw fail('Payment not found', 404);
    if (existing && body.allocations === undefined && (await db.query('SELECT 1 FROM distributor_payment_allocations WHERE company_id=$1 AND payment_id=$2 LIMIT 1', [companyId, existingId])).rowCount) {
      throw fail('Edit this payment from Distributor Payments to preserve its purchase-order allocations', 409);
    }
    const distributorId = existing?.distributor_id || body.distributorId;
    if (!distributorId) throw fail('Distributor is required');
    const supplier = await db.query('SELECT 1 FROM distributor_companies WHERE company_id=$1 AND distributor_id=$2 FOR SHARE', [companyId, distributorId]);
    if (!supplier.rowCount) throw fail('Choose a distributor belonging to this company');
    const ids = parts.map(p => p.purchaseOrderId).filter(Boolean).sort();
    if (ids.length) {
      const orders = await db.query('SELECT id,total_amount,payment_type,due_cleared FROM purchase_orders WHERE company_id=$1 AND distributor_id=$2 AND id=ANY($3::text[]) ORDER BY id FOR UPDATE', [companyId, distributorId, ids]);
      if (orders.rowCount !== ids.length) throw fail('Purchase orders must belong to this distributor and company');
      if (body.allocations !== undefined) {
        const paid = await db.query(`SELECT purchase_order_id,sum(amount) amount FROM (SELECT purchase_order_id,amount FROM distributor_payments WHERE company_id=$1 AND purchase_order_id=ANY($2::text[]) AND ($3::text IS NULL OR id<>$3) UNION ALL SELECT a.purchase_order_id,a.amount FROM distributor_payment_allocations a JOIN distributor_payments p ON p.id=a.payment_id AND p.company_id=a.company_id WHERE a.company_id=$1 AND a.purchase_order_id=ANY($2::text[]) AND ($3::text IS NULL OR p.id<>$3)) paid GROUP BY purchase_order_id`, [companyId, ids, existingId || null]);
        for (const part of parts) {
          const po = orders.rows.find((r: any) => r.id === part.purchaseOrderId);
          const due = Math.round(Number(po.total_amount) * 100) - Math.round(Number(paid.rows.find((r: any) => r.purchase_order_id === po.id)?.amount || 0) * 100);
          if (po.payment_type !== 'CREDIT' || po.due_cleared || Math.round(part.amount * 100) > due) throw fail('An allocation exceeds the current due or its purchase order is already cleared. Reload the orders.');
        }
      }
    }
    const createExpense = existing ? Boolean(existing.expense_id) : Boolean(body.createExpense);
    const category = createExpense ? (await db.query('SELECT id FROM expense_categories WHERE company_id=$1 AND name=$2 ORDER BY id LIMIT 1 FOR SHARE', [companyId, 'Purchase'])).rows[0] : null;
    if (createExpense && !category) throw fail('Set up a Purchase expense category for this company first', 409);
    const id = existingId || crypto.randomUUID();
    const total = Number(body.amount);
    let expenseId = existing?.expense_id || null;
    if (expenseId) {
      const updated = await db.query("UPDATE expenses SET total_amount=$3,payment_mode=$4,note=$5,expense_date=$6,status='Paid',updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id", [expenseId, companyId, total, mode, body.remarks || null, date]);
      if (!updated.rowCount) throw fail('Linked expense ownership changed', 409);
    } else if (createExpense) {
      expenseId = crypto.randomUUID();
      const number = (await db.query('UPDATE companies SET expense_counter=expense_counter+1 WHERE id=$1 RETURNING expense_counter-1 AS number', [companyId])).rows[0].number;
      await db.query("INSERT INTO expenses(id,company_id,expense_number,expense_category_id,total_amount,payment_mode,status,note,expense_date,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'Paid',$7,$8,$8,now())", [expenseId, companyId, number, category.id, total, mode, body.remarks || null, date]);
    }
    // Keep legacy single-order links for old clients. Allocated payments have no
    // direct PO link, so a PO edit cannot overwrite the complete payment total.
    const directOrder = body.allocations === undefined ? parts[0].purchaseOrderId : null;
    if (existing) {
      await db.query('UPDATE distributor_payments SET amount=$3,remarks=$4,bill_no=$5,payment_type=$6,purchase_order_id=$7,created_at=$8 WHERE id=$1 AND company_id=$2', [id, companyId, total, body.remarks || null, body.billNo || null, mode, directOrder, date]);
    } else {
      const number = body.paymentNo || (await db.query('UPDATE companies SET distributor_payment_counter=distributor_payment_counter+1 WHERE id=$1 RETURNING distributor_payment_counter-1 AS number', [companyId])).rows[0].number;
      await db.query('INSERT INTO distributor_payments(id,created_at,payment_no,amount,remarks,bill_no,payment_type,distributor_id,company_id,purchase_order_id,expense_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, date, number, total, body.remarks || null, body.billNo || null, mode, distributorId, companyId, directOrder, expenseId]);
    }
    await db.query('DELETE FROM distributor_payment_allocations WHERE company_id=$1 AND payment_id=$2', [companyId, id]);
    if (body.allocations?.length) {
      for (const part of parts) await db.query('INSERT INTO distributor_payment_allocations(id,company_id,payment_id,purchase_order_id,amount) VALUES($1,$2,$3,$4,$5)', [crypto.randomUUID(), companyId, id, part.purchaseOrderId, part.amount]);
    }
    await selectDistributorAccounts(db, companyId, distributorId, `payment:${id}`, body.accountingAccounts);
    await db.query('COMMIT');
    return { success: true, id, allocations: body.allocations?.length ? parts : [] };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
