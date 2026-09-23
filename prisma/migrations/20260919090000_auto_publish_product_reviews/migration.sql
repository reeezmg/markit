ALTER TABLE ecomm_product_reviews
  ALTER COLUMN status SET DEFAULT 'APPROVED';

UPDATE ecomm_product_reviews
SET status = 'APPROVED', updated_at = NOW()
WHERE status = 'PENDING';
