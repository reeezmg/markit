import {defineEventHandler,readBody} from 'h3'
import {pool} from '../../db'
import {quoteCompany} from '../../utils/erp-quotes'
import {writeSalesOrder} from '../../utils/sales-orders'
export default defineEventHandler(async event=>{
 const context=await quoteCompany(event,true,'sales orders')
 const body=await readBody(event),db=await pool.connect()
 try {await db.query('BEGIN');const result=await writeSalesOrder(db,context,body);await db.query('COMMIT');return result}
 catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
})
