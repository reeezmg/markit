-- Account ledger backfill / rebuild.
-- Usage in Neon:
--   BEGIN;
--   SET LOCAL app.backfill_company_id = 'company-uuid'; -- optional; omit for all companies
--   \i storetools/sql/account-ledger-backfill.sql
--   COMMIT;

DO $$ BEGIN
  CREATE TYPE "AccountLedgerAccountType" AS ENUM ('CASH', 'PRIMARY_BANK', 'BANK', 'INVESTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountLedgerSourceType" AS ENUM ('OPENING', 'BILL', 'EXPENSE', 'DISTRIBUTOR_PAYMENT', 'MONEY_TRANSACTION', 'ACCOUNT_TRANSFER', 'INVESTMENT', 'SALARY_PAYMENT', 'USER_CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance_date timestamp(3) without time zone;

CREATE TABLE IF NOT EXISTS account_ledger_entries (
  id text PRIMARY KEY,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_type "AccountLedgerAccountType" NOT NULL,
  account_id text,
  direction "AccountLedgerDirection" NOT NULL,
  amount numeric(12, 2) NOT NULL,
  source_type "AccountLedgerSourceType" NOT NULL,
  source_id text NOT NULL,
  entry_date timestamp(3) without time zone NOT NULL,
  note text,
  balance_after numeric(12, 2)
);

-- Existing tables created by Prisma may have NOT NULL timestamps without DB defaults.
-- Backfill inserts rely on these defaults, so enforce them even when CREATE TABLE was skipped.
ALTER TABLE account_ledger_entries ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE account_ledger_entries ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS account_ledger_entries_account_idx
  ON account_ledger_entries(company_id, account_type, account_id, entry_date, id);

CREATE INDEX IF NOT EXISTS account_ledger_entries_source_idx
  ON account_ledger_entries(company_id, source_type, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_entries_source_unique_idx
  ON account_ledger_entries(company_id, account_type, COALESCE(account_id, '__primary__'), source_type, source_id, direction);

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
)
DELETE FROM account_ledger_entries ale
USING params p
WHERE p.company_id IS NULL OR ale.company_id = p.company_id;

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, c.id, 'CASH'::"AccountLedgerAccountType", NULL,
       CASE WHEN c.cash >= 0 THEN 'CREDIT' ELSE 'DEBIT' END::"AccountLedgerDirection",
       ABS(c.cash)::numeric(12,2), 'OPENING'::"AccountLedgerSourceType", c.id || ':CASH',
       c.opening_cash_date, 'Cash opening balance'
FROM companies c, params p
WHERE COALESCE(c.cash, 0) <> 0
  AND c.opening_cash_date IS NOT NULL
  AND (p.company_id IS NULL OR c.id = p.company_id)
UNION ALL
SELECT gen_random_uuid()::text, c.id, 'PRIMARY_BANK'::"AccountLedgerAccountType", NULL,
       CASE WHEN c.bank >= 0 THEN 'CREDIT' ELSE 'DEBIT' END::"AccountLedgerDirection",
       ABS(c.bank)::numeric(12,2), 'OPENING'::"AccountLedgerSourceType", c.id || ':PRIMARY_BANK',
       c.opening_bank_date, 'Primary bank opening balance'
FROM companies c, params p
WHERE COALESCE(c.bank, 0) <> 0
  AND c.opening_bank_date IS NOT NULL
  AND (p.company_id IS NULL OR c.id = p.company_id)
UNION ALL
SELECT gen_random_uuid()::text, b.company_id, 'BANK'::"AccountLedgerAccountType", b.id,
       CASE WHEN b.opening_balance >= 0 THEN 'CREDIT' ELSE 'DEBIT' END::"AccountLedgerDirection",
       ABS(b.opening_balance)::numeric(12,2), 'OPENING'::"AccountLedgerSourceType", b.id,
       COALESCE(b.opening_balance_date, b."createdAt"), COALESCE(b.bank_name, 'Bank') || ' opening balance'
FROM bank_accounts b, params p
WHERE COALESCE(b.opening_balance, 0) <> 0
  AND (p.company_id IS NULL OR b.company_id = p.company_id);

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
),
bill_rows AS (
  SELECT b.id, b.company_id, b.created_at, b.invoice_number, 'CASH'::"AccountLedgerAccountType" AS account_type, NULL::text AS account_id, b.grand_total::numeric AS amount
  FROM bills b, params p
  WHERE b.payment_method = 'Cash' AND b.deleted = false AND b.payment_status IN ('PAID','PENDING') AND b.is_markit = false
    AND (p.company_id IS NULL OR b.company_id = p.company_id)
  UNION ALL
  SELECT b.id, b.company_id, b.created_at, b.invoice_number,
         CASE WHEN elem->>'method' = 'Cash' THEN 'CASH' ELSE 'PRIMARY_BANK' END::"AccountLedgerAccountType",
         NULL::text,
         (elem->>'amount')::numeric
  FROM bills b
  JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.split_payments::jsonb) = 'array' THEN b.split_payments::jsonb ELSE '[]'::jsonb END) elem ON true
  CROSS JOIN params p
  WHERE b.payment_method = 'Split' AND elem->>'method' IN ('Cash','UPI','Card')
    AND b.deleted = false AND b.payment_status IN ('PAID','PENDING') AND b.is_markit = false
    AND (p.company_id IS NULL OR b.company_id = p.company_id)
  UNION ALL
  SELECT b.id, b.company_id, b.created_at, b.invoice_number, 'PRIMARY_BANK'::"AccountLedgerAccountType", NULL::text, b.grand_total::numeric
  FROM bills b, params p
  WHERE b.payment_method IN ('UPI','Card') AND b.deleted = false AND b.payment_status IN ('PAID','PENDING') AND b.is_markit = false
    AND (p.company_id IS NULL OR b.company_id = p.company_id)
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, company_id, account_type, account_id, 'CREDIT', SUM(amount)::numeric(12,2), 'BILL', id, created_at, 'Sale #' || invoice_number
FROM bill_rows
WHERE amount > 0
GROUP BY company_id, account_type, account_id, id, created_at, invoice_number;

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, e.company_id,
       CASE WHEN e.payment_mode = 'CASH' THEN 'CASH' ELSE 'PRIMARY_BANK' END::"AccountLedgerAccountType",
       NULL, 'DEBIT', e.total_amount::numeric(12,2), 'EXPENSE', e.id, e.expense_date, COALESCE(e.note, 'Expense')
FROM expenses e, params p
WHERE UPPER(e.status) = 'PAID'
  AND COALESCE(e.total_amount, 0) > 0
  AND (p.company_id IS NULL OR e.company_id = p.company_id);

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, dp.company_id,
       CASE WHEN dp.payment_type = 'CASH' THEN 'CASH' ELSE 'PRIMARY_BANK' END::"AccountLedgerAccountType",
       NULL, 'DEBIT', dp.amount::numeric(12,2), 'DISTRIBUTOR_PAYMENT', dp.id, dp.created_at, COALESCE(dp.remarks, 'Distributor payment')
FROM distributor_payments dp, params p
WHERE COALESCE(dp.amount, 0) > 0
  AND (p.company_id IS NULL OR dp.company_id = p.company_id);

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, mt.company_id,
       CASE WHEN mt.payment_mode = 'CASH' THEN 'CASH' WHEN mt.account_id IS NULL THEN 'PRIMARY_BANK' ELSE 'BANK' END::"AccountLedgerAccountType",
       CASE WHEN mt.payment_mode <> 'CASH' AND mt.account_id IS NOT NULL THEN mt.account_id ELSE NULL END,
       CASE WHEN mt.direction = 'RECEIVED' THEN 'CREDIT' ELSE 'DEBIT' END::"AccountLedgerDirection",
       mt.amount::numeric(12,2), 'MONEY_TRANSACTION', mt.id, mt.created_at, COALESCE(mt.note, 'Money transaction')
FROM money_transactions mt, params p
WHERE mt.status = 'PAID'
  AND COALESCE(mt.amount, 0) > 0
  AND (p.company_id IS NULL OR mt.company_id = p.company_id);

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
),
transfer_rows AS (
  SELECT at.id, at.company_id,
         CASE WHEN at.from_type = 'CASH' THEN 'CASH' WHEN at.from_type = 'INVESTMENT' THEN 'INVESTMENT' WHEN at.from_account_id IS NULL THEN 'PRIMARY_BANK' ELSE 'BANK' END::"AccountLedgerAccountType" AS account_type,
         CASE WHEN at.from_type = 'BANK' AND at.from_account_id IS NOT NULL THEN at.from_account_id ELSE NULL END AS account_id,
         'DEBIT'::"AccountLedgerDirection" AS direction,
         at.amount, at.created_at, at.note
  FROM account_transfers at, params p
  WHERE (p.company_id IS NULL OR at.company_id = p.company_id)
  UNION ALL
  SELECT at.id, at.company_id,
         CASE WHEN at.to_type = 'CASH' THEN 'CASH' WHEN at.to_type = 'INVESTMENT' THEN 'INVESTMENT' WHEN at.to_account_id IS NULL THEN 'PRIMARY_BANK' ELSE 'BANK' END::"AccountLedgerAccountType",
         CASE WHEN at.to_type = 'BANK' AND at.to_account_id IS NOT NULL THEN at.to_account_id ELSE NULL END,
         'CREDIT'::"AccountLedgerDirection",
         at.amount, at.created_at, at.note
  FROM account_transfers at, params p
  WHERE (p.company_id IS NULL OR at.company_id = p.company_id)
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, tr.company_id, tr.account_type, tr.account_id, tr.direction, tr.amount::numeric(12,2), 'ACCOUNT_TRANSFER', tr.id, tr.created_at, COALESCE(tr.note, 'Account transfer')
FROM transfer_rows tr
WHERE COALESCE(tr.amount, 0) > 0;

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
)
INSERT INTO account_ledger_entries (id, company_id, account_type, account_id, direction, amount, source_type, source_id, entry_date, note)
SELECT gen_random_uuid()::text, i.company_id, 'INVESTMENT', NULL,
       CASE WHEN i.direction = 'IN' THEN 'CREDIT' ELSE 'DEBIT' END::"AccountLedgerDirection",
       i.amount::numeric(12,2), 'INVESTMENT', i.id, i.created_at, COALESCE(i.note, 'Investment')
FROM investments i, params p
WHERE i.status = 'COMPLETED'
  AND COALESCE(i.amount, 0) > 0
  AND (p.company_id IS NULL OR i.company_id = p.company_id);

WITH balances AS (
  SELECT id,
         SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
           OVER (PARTITION BY company_id, account_type, account_id ORDER BY entry_date, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after
  FROM account_ledger_entries
)
UPDATE account_ledger_entries ale
SET balance_after = balances.balance_after,
    updated_at = now()
FROM balances
WHERE ale.id = balances.id;

WITH latest AS (
  SELECT DISTINCT ON (company_id, account_type, account_id)
    company_id, account_type, account_id, balance_after
  FROM account_ledger_entries
  ORDER BY company_id, account_type, account_id, entry_date DESC, id DESC
)
SELECT company_id, account_type, account_id, balance_after AS ledger_closing_balance
FROM latest
ORDER BY company_id, account_type, account_id NULLS FIRST;
