-- Delivery confirms collection for COD ecommerce orders. Keep the order,
-- checkout and linked bill consistent; repeated runs are safe.
UPDATE ecomm_orders
SET payment_status = 'PAID', updated_at = now()
WHERE status = 'DELIVERED'
  AND UPPER(COALESCE(payment_method, '')) = 'COD'
  AND payment_status = 'PENDING';

UPDATE ecomm_checkouts AS checkout
SET payment_status = 'PAID', status = 'PAID', updated_at = now()
FROM ecomm_orders AS order_row
WHERE checkout.id = order_row.checkout_id
  AND checkout.company_id = order_row.company_id
  AND order_row.status = 'DELIVERED'
  AND UPPER(COALESCE(order_row.payment_method, '')) = 'COD'
  AND UPPER(COALESCE(checkout.payment_method, '')) = 'COD'
  AND checkout.payment_status = 'PENDING';

UPDATE bills AS bill
SET payment_status = 'PAID', updated_at = now()
FROM ecomm_orders AS order_row
WHERE bill.id = order_row.bill_id
  AND bill.company_id = order_row.company_id
  AND order_row.status = 'DELIVERED'
  AND UPPER(COALESCE(order_row.payment_method, '')) = 'COD'
  AND UPPER(COALESCE(bill.payment_method, '')) = 'COD'
  AND bill.payment_status = 'PENDING';
