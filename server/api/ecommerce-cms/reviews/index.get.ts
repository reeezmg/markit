import { pool } from '~/server/db'
import { ensureEcommProductReviewsTable } from '~/server/utils/ecommProductReviews'
export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event); await ensureEcommProductReviewsTable()
  const { rows } = await pool.query(`SELECT r.id,r.rating,r.review_text AS text,r.photos,r.status,
    r.created_at AS "createdAt",c.name AS "customerName",p.name AS "productName",eo.order_number AS "orderNumber"
    FROM ecomm_product_reviews r JOIN clients c ON c.id=r.client_id JOIN products p ON p.id=r.product_id
    JOIN ecomm_orders eo ON eo.id=r.order_id WHERE r.company_id=$1 ORDER BY r.created_at DESC`, [session.data.companyId])
  return rows
})
