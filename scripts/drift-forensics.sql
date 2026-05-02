-- For every drifted item with a barcode, list its entry history sorted by edit gap.
-- The bill at the top of each per-item block is the strongest qty-edit suspect (bug #2).
-- Items where no entries exist but sold_qty > 0 indicate a hard-deleted bill (bug #4).
--
-- Usage:
--   PGPASSWORD=... psql "$DATABASE_URL" -v company_id="'<uuid>'" -f drift-forensics.sql

\set ON_ERROR_STOP on

WITH drifted_items AS (
  SELECT
    i.id        AS item_id,
    i.barcode,
    p.name      AS product_name,
    s.name      AS subcategory_name,
    i.size,
    COALESCE(i.sold_qty, 0) AS sold_qty,
    COALESCE((
      SELECT SUM(CASE WHEN e.return THEN -e.qty ELSE e.qty END)
      FROM entries e
      WHERE e.item_id = i.id AND e.company_id = i.company_id
    ), 0) AS net_entry_qty
  FROM items i
  JOIN variants v ON i.variant_id = v.id
  JOIN products p ON v.product_id = p.id
  LEFT JOIN subcategories s ON p.subcategory_id = s.id
  WHERE i.company_id = :company_id
    AND i.barcode IS NOT NULL
)
SELECT
  d.barcode,
  d.product_name,
  d.subcategory_name,
  d.size,
  d.sold_qty,
  d.net_entry_qty,
  d.sold_qty - d.net_entry_qty AS drift,
  b.invoice_number,
  b.deleted        AS bill_deleted,
  e.qty            AS entry_qty,
  e.return         AS entry_return,
  e.rate,
  e.value,
  b.created_at     AS bill_created,
  b.updated_at     AS bill_updated,
  ROUND(EXTRACT(EPOCH FROM (b.updated_at - b.created_at))/60)::int AS edit_gap_min,
  CASE
    WHEN b.updated_at > b.created_at + INTERVAL '12 hours' THEN 'STRONG SUSPECT'
    WHEN b.updated_at > b.created_at + INTERVAL '1 hour'   THEN 'possible'
    WHEN b.updated_at > b.created_at + INTERVAL '1 minute' THEN 'edited'
    ELSE ''
  END AS suspect_flag
FROM drifted_items d
LEFT JOIN entries e ON e.item_id = d.item_id
LEFT JOIN bills   b ON e.bill_id = b.id
WHERE d.sold_qty <> d.net_entry_qty
ORDER BY ABS(d.sold_qty - d.net_entry_qty) DESC,
         d.barcode,
         (b.updated_at - b.created_at) DESC NULLS LAST;
