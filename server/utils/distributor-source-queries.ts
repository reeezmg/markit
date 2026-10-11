// Parameters: company, distributor, window start, window end.
export const distributorPurchasesAndCreditsSql = `
  SELECT NULL::integer credit_no,p.created_at,p.total_amount amount,p.bill_no remarks,
    p.id purchase_order_id,p.purchase_order_no
  FROM purchase_orders p WHERE p.company_id=$1 AND p.distributor_id=$2
    AND p.total_amount>0 AND p.created_at BETWEEN $3 AND $4
  UNION ALL
  SELECT c.credit_no,c.created_at,c.amount,c.remarks,NULL::text purchase_order_id,NULL::integer purchase_order_no
  FROM distributor_credits c WHERE c.company_id=$1 AND c.distributor_id=$2
    AND c.purchase_order_id IS NULL AND c.created_at BETWEEN $3 AND $4`;

// Parameters: company, distributor, window start. Count each purchase once.
export const distributorSourceOpeningSql = `SELECT
  COALESCE((SELECT sum(total_amount) FROM purchase_orders WHERE company_id=$1 AND distributor_id=$2
    AND total_amount>0 AND created_at<$3),0)
  +COALESCE((SELECT sum(amount) FROM distributor_credits WHERE company_id=$1 AND distributor_id=$2
    AND purchase_order_id IS NULL AND created_at<$3),0) AS credits_before,
  COALESCE((SELECT sum(amount) FROM distributor_payments WHERE company_id=$1 AND distributor_id=$2
    AND created_at<$3),0) AS payments_before`;
