import {createError,defineEventHandler,getRouterParam,readBody} from 'h3'
import {pool} from '../../db'
import {quoteCompany} from '../../utils/erp-quotes'
import {writeSalesOrder} from '../../utils/sales-orders'
export default defineEventHandler(async event=>{
 const context=await quoteCompany(event,true,'sales orders')
 const id=getRouterParam(event,'orderId');if(!id)throw createError({statusCode:400,statusMessage:'Select a sales order.'})
 const body=await readBody(event),db=await pool.connect()
 try {await db.query('BEGIN');const result=await writeSalesOrder(db,context,body,id);await db.query('COMMIT');return result}
 catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
})
