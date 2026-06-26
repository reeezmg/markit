import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { ensureAccountLedgerSchema } from '~/server/utils/account-ledger'

const CREATE_BILL_FN = `
CREATE OR REPLACE FUNCTION create_bill_plpgsql(p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_payload jsonb := COALESCE(p_body->'payload', '{}'::jsonb);
  v_items jsonb := COALESCE(p_body->'items', '[]'::jsonb);
  v_returned_items jsonb := COALESCE(p_body->'returnedItems', '[]'::jsonb);
  v_bill_id text := p_body->>'uuid';
  v_company_id text := p_body->>'companyId';
  v_bill_company_id text := COALESCE(v_payload #>> '{company,connect,id}', p_body->>'companyId');
  v_client_id text := NULLIF(v_payload #>> '{client,connect,id}', '');
  v_coupon_id text := NULLIF(p_body->>'couponId', '');
  v_invoice_number integer;
  v_split_payments jsonb := NULL;
  v_created_at timestamp := COALESCE(NULLIF(v_payload->>'createdAt', '')::timestamp, now());
  v_payment_method text := COALESCE(NULLIF(v_payload->>'paymentMethod', ''), 'Cash');
  v_payment_status text := COALESCE(NULLIF(v_payload->>'paymentStatus', ''), 'PAID');
  v_grand_total numeric := COALESCE(NULLIF(v_payload->>'grandTotal', '')::numeric, 0);
  v_credit_user_id text := NULLIF(v_payload->>'creditUserId', '');
  v_user_id text := NULLIF(v_payload #>> '{companyUser,connect,companyId_userId,userId}', '');
  v_account_id text := NULLIF(v_payload #>> '{account,connect,id}', '');
  v_redeemed_points integer := COALESCE(NULLIF(v_payload->>'redeemedPoints', '')::integer, 0);
  v_bill_points integer := COALESCE(NULLIF(p_body->>'billPoints', '')::integer, 0);
  v_selected_coupon_audience text;
  v_coupon_row record;
  v_total_value numeric;
  v_min_bill_amount numeric;
  v_already_given numeric;
  v_eligible_count integer;
  v_new_coupons numeric;
  v_per_client_limit numeric;
  v_remaining_global numeric;
  v_created_coupon record;
  v_generated_coupons jsonb := '[]'::jsonb;
  v_credit_amount numeric;
  v_existing_credit_user_id text;
  v_user_to_recalc text;
  v_account record;
BEGIN
  IF v_bill_id IS NULL OR v_bill_id = '' THEN
    RAISE EXCEPTION 'Bill id is required';
  END IF;

  IF v_bill_company_id IS NULL OR v_bill_company_id = '' THEN
    RAISE EXCEPTION 'Company id is required';
  END IF;

  IF jsonb_typeof(v_payload->'splitPayments') = 'array' THEN
    v_split_payments := v_payload->'splitPayments';
  END IF;

  IF v_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients WHERE id = v_client_id) THEN
    v_client_id := NULL;
    v_coupon_id := NULL;
    v_redeemed_points := 0;
    v_bill_points := 0;
  END IF;

  INSERT INTO bills (
    id, invoice_number, subtotal, discount, discount_type, grand_total, return_amt,
    payment_method, redeemed_points, bill_points, created_at,
    payment_status, type, split_payments, company_id, account_id,
    credit_user_id, client_id, user_id, updated_at, coupon_value
  )
  VALUES (
    v_bill_id,
    NULL,
    COALESCE(NULLIF(v_payload->>'subtotal', '')::numeric, 0),
    COALESCE(NULLIF(v_payload->>'discount', '')::numeric, 0),
    COALESCE(NULLIF(v_payload->>'discountType', ''), 'percentage'),
    v_grand_total,
    COALESCE(NULLIF(v_payload->>'returnAmt', '')::numeric, 0),
    v_payment_method,
    v_redeemed_points,
    v_bill_points,
    v_created_at,
    v_payment_status::"PaymentStatus",
    COALESCE(NULLIF(v_payload->>'type', ''), 'BILL')::"OrderType",
    v_split_payments,
    v_bill_company_id,
    v_account_id,
    v_credit_user_id,
    v_client_id,
    v_user_id,
    now(),
    NULLIF(v_payload->>'couponValue', '')::integer
  )
  RETURNING invoice_number INTO v_invoice_number;

  INSERT INTO entries (
    id, name, qty, rate, discount, tax, value, size, barcode,
    return, variant_id, item_id, category_id, company_id, user_id, bill_id, user_name
  )
  SELECT
    gen_random_uuid()::text,
    COALESCE(entry->>'name', ''),
    COALESCE(NULLIF(entry->>'qty', '')::numeric, 1),
    COALESCE(NULLIF(entry->>'rate', '')::numeric, 0),
    COALESCE(NULLIF(entry->>'discount', '')::numeric, 0),
    COALESCE(NULLIF(entry->>'tax', '')::numeric, 0),
    COALESCE(NULLIF(entry->>'value', '')::numeric, 0),
    NULLIF(entry->>'size', ''),
    NULLIF(entry->>'barcode', ''),
    COALESCE((entry->>'return')::boolean, false),
    NULLIF(entry #>> '{variant,connect,id}', ''),
    NULLIF(entry #>> '{item,connect,id}', ''),
    NULLIF(entry #>> '{category,connect,id}', ''),
    v_company_id,
    NULLIF(entry #>> '{companyUser,connect,companyId_userId,userId}', ''),
    v_bill_id,
    NULLIF(entry->>'userName', '')
  FROM jsonb_array_elements(COALESCE(v_payload #> '{entries,create}', '[]'::jsonb)) AS e(entry);

  IF v_credit_user_id IS NOT NULL THEN
    IF v_payment_method = 'Split' AND jsonb_typeof(v_split_payments) = 'array' THEN
      SELECT COALESCE(SUM(COALESCE(NULLIF(payment->>'amount', '')::numeric, 0)), 0)
      INTO v_credit_amount
      FROM jsonb_array_elements(v_split_payments) AS p(payment)
      WHERE payment->>'method' = 'Credit';
    ELSE
      v_credit_amount := v_grand_total;
    END IF;

    IF v_credit_amount > 0 THEN
      SELECT user_id
      INTO v_existing_credit_user_id
      FROM user_ledger_entries
      WHERE company_id = v_bill_company_id
        AND source_type = 'BILL'::"UserLedgerSourceType"
        AND source_id IS NOT DISTINCT FROM v_bill_id
        AND type = 'USER_CREDIT_BILL'::"UserLedgerEntryType"
      LIMIT 1;

      INSERT INTO user_ledger_entries (
        id, company_id, user_id, type, direction, amount, source_type,
        source_id, note, created_at, updated_at
      )
      VALUES (
        gen_random_uuid()::text,
        v_bill_company_id,
        v_credit_user_id,
        'USER_CREDIT_BILL'::"UserLedgerEntryType",
        'DEBIT'::"UserLedgerDirection",
        round(v_credit_amount, 2),
        'BILL'::"UserLedgerSourceType",
        v_bill_id,
        'Bill credit' || CASE WHEN v_invoice_number IS NOT NULL THEN ' #' || v_invoice_number::text ELSE '' END,
        v_created_at,
        now()
      )
      ON CONFLICT (company_id, source_type, source_id, type)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        direction = EXCLUDED.direction,
        amount = EXCLUDED.amount,
        note = EXCLUDED.note,
        created_at = EXCLUDED.created_at,
        updated_at = now();

      FOR v_user_to_recalc IN
        SELECT DISTINCT user_id
        FROM (VALUES (v_credit_user_id), (v_existing_credit_user_id)) AS ids(user_id)
        WHERE user_id IS NOT NULL
      LOOP
        WITH ordered AS (
          SELECT id,
            SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
              OVER (ORDER BY created_at ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
          FROM user_ledger_entries
          WHERE company_id = v_bill_company_id
            AND user_id = v_user_to_recalc
        )
        UPDATE user_ledger_entries ule
        SET balance_after = ordered.balance
        FROM ordered
        WHERE ule.id = ordered.id;
      END LOOP;
    END IF;
  END IF;

  DELETE FROM account_ledger_entries
  WHERE company_id = v_bill_company_id
    AND source_type = 'BILL'::"AccountLedgerSourceType"
    AND source_id = v_bill_id;

  IF v_payment_status IN ('PAID', 'PENDING') AND v_grand_total > 0 THEN
    WITH ledger_rows AS (
      SELECT 'CASH'::"AccountLedgerAccountType" AS account_type,
             COALESCE(SUM(COALESCE(NULLIF(payment->>'amount', '')::numeric, 0)), 0) AS amount
      FROM jsonb_array_elements(COALESCE(v_split_payments, '[]'::jsonb)) AS p(payment)
      WHERE v_payment_method = 'Split' AND payment->>'method' = 'Cash'
      UNION ALL
      SELECT 'PRIMARY_BANK'::"AccountLedgerAccountType",
             COALESCE(SUM(COALESCE(NULLIF(payment->>'amount', '')::numeric, 0)), 0)
      FROM jsonb_array_elements(COALESCE(v_split_payments, '[]'::jsonb)) AS p(payment)
      WHERE v_payment_method = 'Split' AND payment->>'method' IN ('UPI', 'Card')
      UNION ALL
      SELECT 'CREDIT'::"AccountLedgerAccountType",
             COALESCE(SUM(COALESCE(NULLIF(payment->>'amount', '')::numeric, 0)), 0)
      FROM jsonb_array_elements(COALESCE(v_split_payments, '[]'::jsonb)) AS p(payment)
      WHERE v_payment_method = 'Split' AND payment->>'method' = 'Credit'
      UNION ALL SELECT 'CASH'::"AccountLedgerAccountType", v_grand_total WHERE v_payment_method = 'Cash'
      UNION ALL SELECT 'PRIMARY_BANK'::"AccountLedgerAccountType", v_grand_total WHERE v_payment_method IN ('UPI', 'Card')
      UNION ALL SELECT 'CREDIT'::"AccountLedgerAccountType", v_grand_total WHERE v_payment_method = 'Credit'
    ),
    grouped AS (
      SELECT account_type, round(SUM(amount), 2) AS amount
      FROM ledger_rows
      GROUP BY account_type
      HAVING round(SUM(amount), 2) > 0
    )
    INSERT INTO account_ledger_entries (
      id, company_id, account_type, account_id, direction, amount,
      source_type, source_id, entry_date, note, created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      v_bill_company_id,
      account_type,
      NULL,
      'CREDIT'::"AccountLedgerDirection",
      amount,
      'BILL'::"AccountLedgerSourceType",
      v_bill_id,
      v_created_at,
      CASE WHEN v_invoice_number IS NOT NULL THEN 'Sale #' || v_invoice_number::text ELSE 'Sale' END,
      now(),
      now()
    FROM grouped;

    FOR v_account IN
      SELECT DISTINCT company_id, account_type, account_id
      FROM account_ledger_entries
      WHERE company_id = v_bill_company_id
        AND source_type = 'BILL'::"AccountLedgerSourceType"
        AND source_id = v_bill_id
    LOOP
      WITH ordered AS (
        SELECT id,
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
            OVER (ORDER BY entry_date ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
        FROM account_ledger_entries
        WHERE company_id = v_account.company_id
          AND account_type = v_account.account_type
          AND account_id IS NOT DISTINCT FROM v_account.account_id
      )
      UPDATE account_ledger_entries ale
      SET balance_after = ordered.balance,
          updated_at = now()
      FROM ordered
      WHERE ale.id = ordered.id
        AND ale.entry_date >= v_created_at;
    END LOOP;
  END IF;

  IF v_client_id IS NOT NULL THEN
    UPDATE company_clients
    SET points = points + v_bill_points - v_redeemed_points
    WHERE company_id = v_company_id
      AND client_id = v_client_id
      AND points >= v_redeemed_points;
  END IF;

  WITH sold AS (
    SELECT item->>'id' AS id,
           CASE WHEN NULLIF(item->>'variantId', '') IS NOT NULL THEN COALESCE(NULLIF(item->>'qty', '')::integer, 0) ELSE 0 END AS sold_delta,
           -COALESCE(NULLIF(item->>'qty', '')::integer, 0) AS qty_delta
    FROM jsonb_array_elements(v_items) AS i(item)
    WHERE COALESCE((item->>'return')::boolean, false) IS NOT TRUE
      AND NULLIF(item->>'id', '') IS NOT NULL
    UNION ALL
    SELECT item->>'id',
           CASE WHEN NULLIF(item->>'variantId', '') IS NOT NULL THEN -COALESCE(NULLIF(item->>'qty', '')::integer, 0) ELSE 0 END,
           COALESCE(NULLIF(item->>'qty', '')::integer, 0)
    FROM jsonb_array_elements(v_returned_items) AS i(item)
    WHERE NULLIF(item->>'id', '') IS NOT NULL
  ),
  deltas AS (
    SELECT id, SUM(sold_delta)::integer AS sold_delta, SUM(qty_delta)::integer AS qty_delta
    FROM sold
    GROUP BY id
  )
  UPDATE items i
  SET sold_qty = COALESCE(i.sold_qty, 0) + deltas.sold_delta,
      qty = COALESCE(i.qty, 0) + deltas.qty_delta
  FROM deltas
  WHERE i.id = deltas.id;

  IF v_coupon_id IS NOT NULL AND v_client_id IS NOT NULL THEN
    SELECT audience_type INTO v_selected_coupon_audience FROM coupons WHERE id = v_coupon_id;

    IF v_selected_coupon_audience = 'GENERATE' THEN
      UPDATE coupon_clients
      SET usage_limit = COALESCE(usage_limit, 0) - 1
      WHERE id = (
        SELECT id
        FROM coupon_clients
        WHERE coupon_id = v_coupon_id
          AND client_id = v_client_id
          AND COALESCE(usage_limit, 0) > 0
        ORDER BY "createdAt" ASC
        LIMIT 1
      );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No remaining uses for this generated coupon';
      END IF;
    END IF;

    INSERT INTO coupon_usages (id, coupon_id, client_id, bill_id, used_at)
    VALUES (gen_random_uuid()::text, v_coupon_id, v_client_id, v_bill_id, now());

    UPDATE coupons SET times_used = times_used + 1 WHERE id = v_coupon_id;
  END IF;

  DELETE FROM coupon_clients WHERE generated_from_bill_id = v_bill_id;

  IF v_client_id IS NOT NULL THEN
    FOR v_coupon_row IN
      SELECT
        id, code, type, discount_value, max_discount_amount, min_order_value,
        min_bill_amount, is_bill_combine, usage_limit, per_client_limit,
        times_used, start_date, end_date
      FROM coupons
      WHERE audience_type = 'GENERATE'
        AND is_active = true
        AND start_date <= v_created_at
        AND end_date >= v_created_at
        AND (v_company_id IS NULL OR company_id = v_company_id)
      ORDER BY created_at ASC
    LOOP
      v_total_value := v_grand_total;

      IF v_coupon_row.is_bill_combine THEN
        SELECT COALESCE(SUM(grand_total), 0)
        INTO v_total_value
        FROM bills
        WHERE client_id = v_client_id
          AND created_at >= v_coupon_row.start_date
          AND created_at <= v_coupon_row.end_date;
      END IF;

      v_min_bill_amount := COALESCE(v_coupon_row.min_bill_amount, 1);
      IF v_coupon_row.min_bill_amount IS NOT NULL AND v_total_value < v_coupon_row.min_bill_amount THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(SUM(COALESCE(usage_limit, 1)), 0)
      INTO v_already_given
      FROM coupon_clients
      WHERE coupon_id = v_coupon_row.id
        AND client_id = v_client_id;

      v_eligible_count := floor(v_total_value / v_min_bill_amount);
      IF v_coupon_row.is_bill_combine THEN
        v_new_coupons := v_eligible_count - v_already_given;
      ELSE
        v_new_coupons := v_eligible_count;
      END IF;

      v_per_client_limit := COALESCE(v_coupon_row.per_client_limit::numeric, 1000000000);
      v_new_coupons := LEAST(v_new_coupons, v_per_client_limit - v_already_given);

      IF v_coupon_row.usage_limit IS NOT NULL THEN
        v_remaining_global := v_coupon_row.usage_limit - v_coupon_row.times_used;
        v_new_coupons := LEAST(v_new_coupons, v_remaining_global);
      END IF;

      IF v_new_coupons <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO coupon_clients (
        id, coupon_id, client_id, generated_from_bill_id, usage_limit
      )
      VALUES (gen_random_uuid()::text, v_coupon_row.id, v_client_id, v_bill_id, 1)
      RETURNING id, coupon_id, usage_limit, generated_from_bill_id
      INTO v_created_coupon;

      v_generated_coupons := v_generated_coupons || jsonb_build_array(jsonb_build_object(
        'id', v_created_coupon.id,
        'couponId', v_created_coupon.coupon_id,
        'couponNumber', v_coupon_row.code,
        'code', v_coupon_row.code,
        'type', v_coupon_row.type,
        'discountValue', v_coupon_row.discount_value,
        'maxDiscountAmount', v_coupon_row.max_discount_amount,
        'minOrderValue', v_coupon_row.min_order_value,
        'endDate', v_coupon_row.end_date,
        'usageLimit', v_created_coupon.usage_limit,
        'generatedFromBillId', v_created_coupon.generated_from_bill_id
      ));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'billId', v_bill_id,
    'invoiceNumber', v_invoice_number,
    'generatedCoupons', v_generated_coupons
  );
END;
$fn$;
`

let fnReady = false
let ensurePromise: Promise<void> | null = null

async function ensureCreateBillFn(client: any) {
  if (fnReady) return
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureAccountLedgerSchema(client)
      await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percentage'`)
      await client.query(CREATE_BILL_FN)
      fnReady = true
    })().catch((e) => {
      ensurePromise = null
      throw e
    })
  }
  await ensurePromise
}

const TRANSIENT_ERROR_CODES = [
  '40001',
  '40P01',
  '53300',
  '57P01',
  '55006',
  '08006',
  '08003',
  'P1001',
]

async function logError(error: any, body: any) {
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO save_error_requests (id, created_at, company_id, request_data, error_message)
       VALUES (gen_random_uuid()::text, now(), $1, $2, $3)`,
      [
        body?.companyId || null,
        JSON.stringify(body),
        error?.message || 'Unknown error',
      ],
    )
  } catch (logErr: any) {
    console.error('Failed to log bill create error:', logErr?.message || logErr)
  } finally {
    client.release()
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  async function runCreate(attempt = 1): Promise<any> {
    const client = await pool.connect()
    try {
      await ensureCreateBillFn(client)
      const res = await client.query(
        `SELECT create_bill_plpgsql($1::jsonb) AS result`,
        [JSON.stringify(body)],
      )
      return res.rows[0]?.result
    } catch (error: any) {
      console.error(`Bill create attempt ${attempt} failed:`, error?.message || error)

      if (TRANSIENT_ERROR_CODES.includes(error?.code) && attempt < 3) {
        const delay = 200 * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return runCreate(attempt + 1)
      }

      await logError(error, body)
      throw error
    } finally {
      client.release()
    }
  }

  try {
    return await runCreate()
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to create bill after retries',
    })
  }
})
