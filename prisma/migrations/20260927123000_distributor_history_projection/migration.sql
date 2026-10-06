-- Preserve the actual supplier ledger when older PO headers disagree with it.
CREATE OR REPLACE VIEW accountant_v2_distributor_events AS
SELECT c.company_id,c.distributor_id,'credit:'||c.id AS source_key,
  CASE WHEN c.money_transaction_id IS NOT NULL THEN 'RECEIPT' ELSE 'PURCHASE' END AS kind,
  c.created_at AS event_date,round(c.amount::numeric,2) AS amount,0::numeric AS tax,
  COALESCE(m.payment_mode::text,'CASH') AS mode,m.account_id AS bank_id,COALESCE(c.remarks,'') AS description,
  COALESCE(c."billNo",'DC-'||c.credit_no::text,c.id) AS reference
FROM distributor_credits c LEFT JOIN money_transactions m ON m.id=c.money_transaction_id AND m.company_id=c.company_id
WHERE c.purchase_order_id IS NULL
UNION ALL
SELECT c.company_id,c.distributor_id,'purchase:'||c.purchase_order_id,'PURCHASE',min(c.created_at),
  round(sum(c.amount)::numeric,2),
  CASE WHEN round(sum(c.amount)::numeric,2)=round(max(p.total_amount)::numeric,2) THEN round(COALESCE(max(p.tax),0)::numeric,2) ELSE 0 END,
  NULL,NULL,'Purchase credit',COALESCE(max(p.bill_no),'PO-'||max(p.purchase_order_no)::text,c.purchase_order_id)
FROM distributor_credits c LEFT JOIN purchase_orders p ON p.id=c.purchase_order_id AND p.company_id=c.company_id
WHERE c.purchase_order_id IS NOT NULL GROUP BY c.company_id,c.distributor_id,c.purchase_order_id
UNION ALL
SELECT p.company_id,p.distributor_id,'purchase:'||p.id,'PURCHASE',p.created_at,
  round(p.total_amount::numeric,2),round(COALESCE(p.tax,0)::numeric,2),NULL,NULL,'Paid purchase (legacy purchase side missing)',
  COALESCE(p.bill_no,'PO-'||p.purchase_order_no::text,p.id)
FROM purchase_orders p WHERE p.distributor_id IS NOT NULL AND p.payment_type IS NOT NULL AND p.total_amount<>0
  AND NOT EXISTS(SELECT 1 FROM distributor_credits c WHERE c.purchase_order_id=p.id AND c.company_id=p.company_id)
  AND EXISTS(SELECT 1 FROM distributor_payments dp WHERE dp.purchase_order_id=p.id AND dp.company_id=p.company_id AND dp.distributor_id=p.distributor_id AND dp.payment_type::text<>'RETURN')
UNION ALL
SELECT p.company_id,p.distributor_id,'payment:'||p.id,
  CASE WHEN p.payment_type::text='RETURN' THEN 'RETURN' ELSE 'PAYMENT' END,
  COALESCE(r.created_at,p.created_at),round(p.amount::numeric,2),round(COALESCE(r.tax_amount,0)::numeric,2),
  COALESCE(p.payment_type::text,'CASH'),NULL,COALESCE(p.remarks,''),
  COALESCE('PR-'||r.return_no::text,'DP-'||p.payment_no::text,p.id)
FROM distributor_payments p LEFT JOIN purchase_returns r ON r.id=p.purchase_return_id AND r.company_id=p.company_id
UNION ALL
SELECT d.company_id,d.distributor_id,'opening','OPENING',
  COALESCE(d.opening_due_date,(SELECT min(x.created_at) FROM (
    SELECT created_at FROM distributor_credits WHERE company_id=d.company_id AND distributor_id=d.distributor_id
    UNION ALL SELECT created_at FROM distributor_payments WHERE company_id=d.company_id AND distributor_id=d.distributor_id
  ) x)-interval '1 millisecond',timestamp '1970-01-01'),
  round(COALESCE(d.opening_due,0)::numeric,2),0,NULL,NULL,'Distributor opening balance','Opening'
FROM distributor_companies d WHERE COALESCE(d.opening_due,0)<>0;
