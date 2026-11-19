import {createError,defineEventHandler,getRouterParam} from 'h3'
import {pool} from '../../db'
import {quoteCompany} from '../../utils/erp-quotes'
import {readSalesOrder} from '../../utils/sales-orders'
export default defineEventHandler(async event=>{
 const {companyId}=await quoteCompany(event),id=getRouterParam(event,'orderId')
 if(!id)throw createError({statusCode:400,statusMessage:'Select a sales order.'})
 const db=await pool.connect()
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await readSalesOrder(db,companyId,id);await db.query('COMMIT');return result}
 catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
})
