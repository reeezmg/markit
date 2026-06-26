import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { ensureAccountLedgerSchema } from '~/server/utils/account-ledger'

// A plpgsql function does the whole create in ONE round-trip: bump the company
// expense counter, insert the expense, and (only for PAID expenses) write the
// account-ledger DEBIT + recompute that account's running balances.
//
// NOTE: this duplicates the ledger logic from server/utils/account-ledger.ts
// (`expenseLedgerRows` + `rebuildAccountLedgerForSource` for a brand-new source:
// one DEBIT into CASH/PRIMARY_BANK, then `recalculateAccountLedgerBalances`).
// Keep the two in sync if that logic changes.
const CREATE_EXPENSE_FN = `
CREATE OR REPLACE FUNCTION create_expense(
  p_id text, p_company_id text, p_user_id text, p_category_id text,
  p_expense_date timestamp, p_note text, p_payment_mode "PaymentMode", p_status text,
  p_receipt text, p_receipt_name text, p_tax_amount numeric, p_total_amount numeric,
  p_ledger_id text
) RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_num integer;
  v_account_type "AccountLedgerAccountType";
BEGIN
  -- Reserve the next expense number (gap-free: bump + insert share this call's
  -- implicit transaction) and insert the expense.
  UPDATE companies SET expense_counter = expense_counter + 1
  WHERE id = p_company_id
  RETURNING expense_counter - 1 INTO v_num;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  INSERT INTO expenses (
    id, company_id, from_id, expense_category_id, expense_date, note,
    payment_mode, status, receipt, receipt_name, tax_amount, total_amount,
    created_at, updated_at, expense_number
  ) VALUES (
    p_id, p_company_id, p_user_id, p_category_id, p_expense_date, p_note,
    p_payment_mode, p_status, p_receipt, p_receipt_name,
    p_tax_amount, p_total_amount, now(), now(), v_num
  );

  -- Only PAID expenses touch the account ledger.
  IF upper(p_status) = 'PAID' AND p_total_amount > 0 THEN
    v_account_type := CASE WHEN p_payment_mode = 'CASH'
                           THEN 'CASH'::"AccountLedgerAccountType"
                           ELSE 'PRIMARY_BANK'::"AccountLedgerAccountType" END;

    INSERT INTO account_ledger_entries (
      id, company_id, account_type, account_id, direction, amount,
      source_type, source_id, entry_date, note, created_at, updated_at
    ) VALUES (
      p_ledger_id, p_company_id, v_account_type, NULL,
      'DEBIT'::"AccountLedgerDirection", round(p_total_amount, 2),
      'EXPENSE'::"AccountLedgerSourceType", p_id, p_expense_date,
      COALESCE(p_note, 'Expense'), now(), now()
    );

    -- Recompute running balance_after for this account from the entry date on.
    WITH ordered AS (
      SELECT id,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
          OVER (ORDER BY entry_date ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
      FROM account_ledger_entries
      WHERE company_id = p_company_id
        AND account_type = v_account_type
        AND account_id IS NOT DISTINCT FROM NULL
    )
    UPDATE account_ledger_entries ale
    SET balance_after = ordered.balance, updated_at = now()
    FROM ordered
    WHERE ale.id = ordered.id AND ale.entry_date >= p_expense_date;
  END IF;

  RETURN v_num;
END;
$fn$;
`

// Created once per server process. `fnReady` short-circuits without a round-trip
// on every later request (steady state is a single `SELECT create_expense(...)`);
// `ensurePromise` serializes the one-time setup so concurrent first requests
// don't both run the DDL, and is reset on failure so it can retry.
let fnReady = false
let ensurePromise: Promise<void> | null = null
async function ensureCreateExpenseFn(client: any) {
  if (fnReady) return
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureAccountLedgerSchema(client) // guarantees the ledger types/table exist
      await client.query(CREATE_EXPENSE_FN)
      fnReady = true
    })().catch((e) => {
      ensurePromise = null
      throw e
    })
  }
  await ensurePromise
}

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<any>(event)
  const totalAmount = Number(body.totalAmount || 0)
  if (!body.expensecategoryId) throw createError({ statusCode: 400, statusMessage: 'Expense category is required' })
  if (!totalAmount || totalAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })

  const id = crypto.randomUUID()
  const ledgerId = crypto.randomUUID()
  const paymentMode = body.paymentMode || 'CASH'
  const status = body.status || 'Pending'
  const expenseDate = body.expenseDate || body.date ? new Date(body.expenseDate || body.date) : new Date()

  const client = await pool.connect()
  try {
    await ensureCreateExpenseFn(client)
    // One round-trip: the function call is a single statement, so all its writes
    // commit together (or roll back together if it raises).
    const res = await client.query(
      `SELECT create_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS expense_number`,
      [id, companyId, body.userId || null, body.expensecategoryId, expenseDate, body.note || null, paymentMode, status, body.receipt || null, body.receiptName || null, Number(body.taxAmount || 0), totalAmount, ledgerId],
    )
    return { success: true, id, expenseNumber: res.rows[0]?.expense_number }
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.includes('Company not found')) {
      throw createError({ statusCode: 404, statusMessage: 'Company not found' })
    }
    throw err
  } finally {
    client.release()
  }
})
