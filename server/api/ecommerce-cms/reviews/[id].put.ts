import { pool } from '~/server/db'
import { ensureEcommProductReviewsTable } from '~/server/utils/ecommProductReviews'
export default defineEventHandler(async (event) => {
  const session=await requireAuthSession(event); await ensureEcommProductReviewsTable(); const body=await readBody<{status:string}>(event)
  const status=String(body.status||'').toUpperCase(); if(!['PENDING','APPROVED','REJECTED'].includes(status)) throw createError({statusCode:400,statusMessage:'Invalid status'})
  const {rows}=await pool.query(`UPDATE ecomm_product_reviews SET status=$1,updated_at=now() WHERE id=$2 AND company_id=$3 RETURNING id,status`,[status,getRouterParam(event,'id'),session.data.companyId])
  if(!rows[0]) throw createError({statusCode:404,statusMessage:'Review not found'}); return rows[0]
})
