import {createError,defineEventHandler,getRouterParam} from 'h3'
import {pool} from '../../db'
import {quoteCompany} from '../../utils/erp-quotes'
export default defineEventHandler(async event=>{
 const {companyId}=await quoteCompany(event,true,'sales orders'),id=getRouterParam(event,'orderId')
 if(!id)throw createError({statusCode:400,statusMessage:'Select a sales order.'})
 const db=await pool.connect()
 try{
  await db.query('BEGIN');await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[companyId])
  const row=(await db.query('SELECT id,invoiced FROM sales_orders WHERE id=$1 AND company_id=$2 AND deleted=false FOR UPDATE',[id,companyId])).rows[0]
  if(!row)throw createError({statusCode:404,statusMessage:'Sales order not found.'})
  if(row.invoiced||(await db.query('SELECT 1 FROM bills WHERE sales_order_id=$1 AND company_id=$2 AND deleted=false LIMIT 1',[id,companyId])).rows.length)throw createError({statusCode:409,statusMessage:'Sales orders with linked invoices cannot be deleted.'})
  await db.query('UPDATE sales_orders SET deleted=true WHERE id=$1 AND company_id=$2',[id,companyId]);await db.query('COMMIT');return {success:true}
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
})
