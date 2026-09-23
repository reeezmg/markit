import { pool } from '~/server/db'
export default defineEventHandler(async(event)=>{const s=await requireAuthSession(event);await pool.query('DELETE FROM ecomm_product_reviews WHERE id=$1 AND company_id=$2',[getRouterParam(event,'id'),s.data.companyId]);return{ok:true}})
