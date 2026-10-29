import { defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'

// Single-company, read-only choices. Save revalidates the assignment under locks.
export default defineEventHandler(async event => {
  const { data } = await useCompanyRequestSession(event)
  const search = String(getQuery(event).search || '').trim().slice(0, 150)
  const result = await pool.query(
    `SELECT p.id, p.company_id AS "companyId", p.product_no AS "productNo", p.name,
            c.name AS "categoryName", b.name AS "brandName"
     FROM products p
     LEFT JOIN categories c ON c.id=p.category_id AND c.company_id=p.company_id
     LEFT JOIN brands b ON b.id=p.brand_id AND b.company_id=p.company_id
     WHERE p.company_id=$1 AND p.purchaseorder_id IS NULL
       AND ($2='' OR p.name ILIKE $3 OR p.product_no::text=$2
         OR 'PROD-' || p.product_no::text ILIKE $3
         OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.company_id=p.company_id
           AND (v.name ILIKE $3 OR v.code ILIKE $3 OR v.variant_no::text=$2
             OR 'VAR-' || v.variant_no::text ILIKE $3)))
     ORDER BY p.created_at DESC, p.id LIMIT 50`,
    [data.companyId, search, `%${search}%`],
  )
  return result.rows
})
