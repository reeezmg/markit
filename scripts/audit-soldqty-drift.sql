-- Find items (with barcode) where sold_qty has drifted from the net entry qty.
-- Net entry qty = SUM(qty) for sales − SUM(qty) for returns, joined via items.id = entries.item_id.
--
-- Usage:
--   PGPASSWORD=... psql "$DATABASE_URL" -v company_id="'<uuid>'" -f audit-soldqty-drift.sql
-- or paste into any SQL client and replace :company_id below.

\set ON_ERROR_STOP on

WITH entry_totals AS (
  SELECT
    e.item_id,
    SUM(CASE WHEN e.return THEN -e.qty ELSE e.qty END) AS net_entry_qty
  FROM entries e
  WHERE e.company_id = :company_id
    AND e.item_id IS NOT NULL
  GROUP BY e.item_id
)
SELECT
  i.id            AS item_id,
  i.barcode,
  p.name          AS product_name,
  s.name          AS subcategory_name,
  i.size,
  COALESCE(i.sold_qty, 0)        AS sold_qty,
  COALESCE(et.net_entry_qty, 0)  AS net_entry_qty,
  COALESCE(i.sold_qty, 0) - COALESCE(et.net_entry_qty, 0) AS drift,
  i.qty           AS current_stock_qty,
  i.initial_qty
FROM items i
JOIN variants v       ON i.variant_id = v.id
JOIN products p       ON v.product_id = p.id
LEFT JOIN subcategories s ON p.subcategory_id = s.id
LEFT JOIN entry_totals et ON et.item_id = i.id
WHERE i.company_id = :company_id
  AND i.barcode IS NOT NULL
  AND COALESCE(i.sold_qty, 0) <> COALESCE(et.net_entry_qty, 0)
ORDER BY ABS(COALESCE(i.sold_qty, 0) - COALESCE(et.net_entry_qty, 0)) DESC,
         p.name,
         i.size;
