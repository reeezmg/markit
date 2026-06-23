-- Backfill tax rates on old bill entries and recompute bills.tax.
--
-- Usage in Neon for one company:
--   BEGIN;
--   SET LOCAL app.backfill_company_id = 'company-uuid';
--   -- paste/run this full script
--   COMMIT;
--
-- Usage for all companies:
--   BEGIN;
--   -- paste/run this full script without SET LOCAL
--   COMMIT;
--
-- What this does:
--   1. Updates entries.tax only when it is NULL or 0.
--   2. Uses variants.tax first.
--   3. Falls back to categories tax config:
--      - FIXED: fixed_tax
--      - VARIABLE: tax_above_threshold / tax_below_threshold based on line value
--   4. Recomputes bills.tax as actual tax amount using companies.is_tax_included.
--   5. Excludes deleted and Markit bills.

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
),
candidate_entries AS (
  SELECT
    e.id,
    b.company_id,
    COALESCE(
      NULLIF(v.tax, 0),
      NULLIF(
        CASE
          WHEN c.tax_type = 'VARIABLE' THEN
            CASE
              WHEN COALESCE(e.value, COALESCE(e.rate, 0) * COALESCE(e.qty, 0), 0) > COALESCE(c.threshold_amount, 0)
                THEN COALESCE(c.tax_above_threshold, 0)
              ELSE COALESCE(c.tax_below_threshold, 0)
            END
          ELSE COALESCE(c.fixed_tax, 0)
        END,
        0
      )
    )::numeric AS resolved_tax
  FROM entries e
  JOIN bills b ON b.id = e.bill_id
  LEFT JOIN variants v ON v.id = e.variant_id
  LEFT JOIN categories c ON c.id = e.category_id
  CROSS JOIN params p
  WHERE (p.company_id IS NULL OR b.company_id = p.company_id)
    AND b.deleted = false
    AND b.is_markit = false
    AND COALESCE(e.tax, 0) = 0
)
UPDATE entries e
SET tax = candidate_entries.resolved_tax
FROM candidate_entries
WHERE e.id = candidate_entries.id
  AND COALESCE(candidate_entries.resolved_tax, 0) > 0;

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
),
tax_by_bill AS (
  SELECT
    b.id AS bill_id,
    ROUND(
      COALESCE(
        SUM(
          CASE WHEN COALESCE(c.is_tax_included, true) = true
            THEN COALESCE(e.value, 0) * COALESCE(e.tax, 0) / (100.0 + NULLIF(COALESCE(e.tax, 0), 0))
            ELSE COALESCE(e.value, 0) * COALESCE(e.tax, 0) / 100.0
          END
        ),
        0
      )::numeric,
      2
    ) AS tax_amount
  FROM bills b
  JOIN companies c ON c.id = b.company_id
  JOIN entries e ON e.bill_id = b.id
  CROSS JOIN params p
  WHERE (p.company_id IS NULL OR b.company_id = p.company_id)
    AND b.deleted = false
    AND b.is_markit = false
  GROUP BY b.id
)
UPDATE bills b
SET tax = tax_by_bill.tax_amount,
    updated_at = now()
FROM tax_by_bill
WHERE b.id = tax_by_bill.bill_id
  AND COALESCE(b.tax, 0) IS DISTINCT FROM tax_by_bill.tax_amount;

WITH params AS (
  SELECT NULLIF(current_setting('app.backfill_company_id', true), '') AS company_id
),
entry_summary AS (
  SELECT
    COUNT(*) FILTER (WHERE COALESCE(e.tax, 0) > 0) AS entries_with_tax,
    COUNT(*) FILTER (WHERE COALESCE(e.tax, 0) = 0) AS entries_without_tax
  FROM entries e
  JOIN bills b ON b.id = e.bill_id
  CROSS JOIN params p
  WHERE (p.company_id IS NULL OR b.company_id = p.company_id)
    AND b.deleted = false
    AND b.is_markit = false
),
bill_summary AS (
  SELECT
    COUNT(*) AS bills,
    ROUND(COALESCE(SUM(b.tax), 0)::numeric, 2) AS total_bill_tax
  FROM bills b
  CROSS JOIN params p
  WHERE (p.company_id IS NULL OR b.company_id = p.company_id)
    AND b.deleted = false
    AND b.is_markit = false
)
SELECT
  entry_summary.entries_with_tax,
  entry_summary.entries_without_tax,
  bill_summary.bills,
  bill_summary.total_bill_tax
FROM entry_summary, bill_summary;
