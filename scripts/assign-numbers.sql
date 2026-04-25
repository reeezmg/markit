-- ============================================================
-- Assign sequential numbers to existing records per company
-- Run this ONCE after the schema migration to backfill numbers
-- ============================================================

BEGIN;

-- ── 1. Expenses: assign expense_number per company, ordered by expense_date ──
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY expense_date ASC, id ASC) AS num
  FROM expenses
)
UPDATE expenses SET expense_number = numbered.num
FROM numbered WHERE expenses.id = numbered.id;

-- Update expense counters on companies
UPDATE companies SET expense_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(expense_number), 0) + 1 AS next_num
  FROM expenses
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 2. DistributorCompany: assign distributor_number per company ──
WITH numbered AS (
  SELECT distributor_id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY distributor_id ASC) AS num
  FROM distributor_companies
)
UPDATE distributor_companies SET distributor_number = numbered.num
FROM numbered
WHERE distributor_companies.distributor_id = numbered.distributor_id
  AND distributor_companies.company_id = numbered.company_id;

-- Update distributor counters on companies
UPDATE companies SET distributor_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(distributor_number), 0) + 1 AS next_num
  FROM distributor_companies
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 3. DistributorPayment: assign payment_no per company, ordered by created_at ──
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS num
  FROM distributor_payments
)
UPDATE distributor_payments SET payment_no = numbered.num
FROM numbered WHERE distributor_payments.id = numbered.id;

-- Update distributor payment counters on companies
UPDATE companies SET distributor_payment_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(payment_no), 0) + 1 AS next_num
  FROM distributor_payments
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 4. DistributorCredit: assign credit_no per company, ordered by created_at ──
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS num
  FROM distributor_credits
)
UPDATE distributor_credits SET credit_no = numbered.num
FROM numbered WHERE distributor_credits.id = numbered.id;

-- Update distributor credit counters on companies
UPDATE companies SET distributor_credit_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(credit_no), 0) + 1 AS next_num
  FROM distributor_credits
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 5. CompanyClient: assign client_number per company ──
WITH numbered AS (
  SELECT company_id, client_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY client_id ASC) AS num
  FROM company_clients
)
UPDATE company_clients SET client_number = numbered.num
FROM numbered
WHERE company_clients.company_id = numbered.company_id
  AND company_clients.client_id = numbered.client_id;

-- Update client counters on companies
UPDATE companies SET client_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(client_number), 0) + 1 AS next_num
  FROM company_clients
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 6. Account: assign account_number per company ──
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id ASC) AS num
  FROM accounts
)
UPDATE accounts SET account_number = numbered.num
FROM numbered WHERE accounts.id = numbered.id;

-- Update account counters on companies
UPDATE companies SET account_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(account_number), 0) + 1 AS next_num
  FROM accounts
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 7. PurchaseReturn: assign return_no per company, ordered by created_at ──
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS num
  FROM purchase_returns
)
UPDATE purchase_returns SET return_no = numbered.num
FROM numbered WHERE purchase_returns.id = numbered.id;

-- Update return counters on companies
UPDATE companies SET return_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(return_no), 0) + 1 AS next_num
  FROM purchase_returns
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

-- ── 8. CompanyUser code (already has user_code_counter, just backfill NULLs) ──
-- Only assign code to users that don't already have one
WITH numbered AS (
  SELECT company_id, user_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY user_id ASC) AS num
  FROM company_users
  WHERE code IS NULL
)
UPDATE company_users SET code = numbered.num + COALESCE(
  (SELECT MAX(code) FROM company_users cu2 WHERE cu2.company_id = numbered.company_id), 0
)
FROM numbered
WHERE company_users.company_id = numbered.company_id
  AND company_users.user_id = numbered.user_id;

-- Update user code counters
UPDATE companies SET user_code_counter = sub.next_num
FROM (
  SELECT company_id, COALESCE(MAX(code), 0) + 1 AS next_num
  FROM company_users
  GROUP BY company_id
) sub
WHERE companies.id = sub.company_id;

COMMIT;

-- ============================================================
-- Verify counts (run after to check)
-- ============================================================
-- SELECT id, expense_counter, distributor_counter, distributor_payment_counter,
--        distributor_credit_counter, client_counter, account_counter,
--        return_counter, user_code_counter
-- FROM companies;
