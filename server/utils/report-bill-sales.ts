// One definition of invoice-date sales and payment-date collections for screen,
// PDF and Excel. Receipt journals include dated reversals; source receipt status
// is deliberately not used to erase previously collected money from history.
export function billCreditSql(alias = 'b', total = `${alias}.grand_total`) {
  return `(CASE WHEN ${alias}.payment_method='Credit' THEN ${total}::numeric
    WHEN ${alias}.payment_method='Split' THEN (SELECT COALESCE(sum((p->>'amount')::numeric),0)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${alias}.split_payments)='array' THEN ${alias}.split_payments ELSE '[]'::jsonb END) p WHERE p->>'method'='Credit')
    ELSE 0 END)`
}

export function billSalesSql(total: string) {
  return `WITH sales_bills AS (
    SELECT b.*, ${total} AS report_total FROM bills b WHERE b.company_id=$1 AND b.deleted=false
      AND b.payment_status IN ('PAID','PENDING') AND b.is_markit=false
      AND b.created_at BETWEEN $2 AND $3 AND ($4=true OR b.precedence IS NOT TRUE)
  ), sales_parts AS (
    SELECT id,created_at,payment_status,payment_method AS method,report_total::numeric AS amount
    FROM sales_bills WHERE payment_method IS DISTINCT FROM 'Split'
    UNION ALL
    SELECT b.id,b.created_at,b.payment_status,p->>'method',(p->>'amount')::numeric FROM sales_bills b,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.split_payments)='array' THEN b.split_payments ELSE '[]'::jsonb END) p
    WHERE b.payment_method='Split'
  ), receipt_parts AS (
    SELECT j.journal_date AS date,p.payment_mode AS method,
      CASE WHEN j.source_type='ERP_CREDIT_RECEIPT_REVERSAL' THEN -p.amount ELSE p.amount END AS amount
    FROM payments p JOIN accountant_v2_manual_journals j ON j.company_id=p.company_id AND j.source_id=p.id
      AND j.source_type IN ('ERP_CREDIT_RECEIPT','ERP_CREDIT_RECEIPT_REVERSAL')
    JOIN bills b ON b.id=p.bill_id AND b.company_id=p.company_id
    WHERE p.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL
      AND j.journal_date BETWEEN $2 AND $3 AND ($4=true OR b.precedence IS NOT TRUE)
  ), collections AS (
    SELECT method,amount FROM sales_parts s WHERE method IN ('Cash','UPI','Card','Bank','Cheque')
      AND (s.payment_status='PAID' OR EXISTS(SELECT 1 FROM sales_parts credit_part WHERE credit_part.id=s.id AND credit_part.method='Credit'))
    UNION ALL SELECT method,amount FROM receipt_parts
  ) SELECT
    COALESCE((SELECT sum(amount) FROM sales_parts),0) AS total_sales,
    COALESCE((SELECT sum(amount) FROM sales_parts WHERE method='Credit'),0) AS credit,
    COALESCE((SELECT sum(amount) FROM receipt_parts),0) AS credit_collections,
    COALESCE((SELECT sum(amount) FROM collections),0) AS total_collections,
    ${['Cash','UPI','Card','Bank','Cheque'].map(method => `COALESCE((SELECT sum(amount) FROM sales_parts WHERE method='${method}'),0) AS ${method.toLowerCase()},
    COALESCE((SELECT sum(amount) FROM collections WHERE method='${method}'),0) AS collected_${method.toLowerCase()}`).join(',\n')}`
}
