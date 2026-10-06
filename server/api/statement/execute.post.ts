import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { executeStatementRow } from '~/server/utils/statement-execution'
import { randomUUID } from 'node:crypto'
export default defineEventHandler(async(event)=>{
  const session=await useAuthSession(event), companyId=session.data?.companyId
  if (!companyId) throw createError({statusCode:401,statusMessage:'Not authenticated'})
  const body=await readBody<{batchId:string;bankAccountId:string}>(event)
  if (!body?.batchId || !body.bankAccountId) throw createError({statusCode:400,statusMessage:'batchId and bankAccountId are required'})
  const batch=(await pool.query('SELECT id,chat_id FROM statement_batches WHERE id=$1 AND company_id=$2',[body.batchId,companyId])).rows[0]
  if (!batch) throw createError({statusCode:404,statusMessage:'Batch not found'})
  const rows=(await pool.query('SELECT id,s_no,operation FROM statement_rows WHERE batch_id=$1 ORDER BY s_no',[body.batchId])).rows
  if (rows.some(row=>!row.operation)) throw createError({statusCode:400,statusMessage:'Assign all row operations first'})
  const results:any[]=[]
  let executed=0,skipped=0,changed=0
  for (const row of rows) {
    try {
      const result=await executeStatementRow(companyId,session.data.id || 'statement',row.id,body.bankAccountId)
      if (!result.replayed) changed++
      if (result.replayed || result.skipped) skipped++; else executed++
      results.push({sno:row.s_no,status:result.replayed || result.skipped?'skipped':'success',operationId:result.operationId})
    } catch(error:any) { results.push({sno:row.s_no,status:'error',error:error.message}) }
  }
  const errors=results.filter(result=>result.status==='error').length
  const summary=`${executed} executed, ${skipped} skipped, ${errors} error(s)`
  if (batch.chat_id && (changed || errors)) {
    try {
      const details=results.filter(result=>result.status==='error').map(result=>`Row ${result.sno}: ${result.error}`).join('; ')
      await pool.query(`INSERT INTO ai_chat_messages(id,chat_id,role,content) VALUES($1,$2,'assistant',$3)`,[randomUUID(),batch.chat_id,`Statement processed: ${summary}.${details ? ' '+details : ''}`])
      await pool.query('UPDATE ai_chats SET updated_at=now() WHERE id=$1',[batch.chat_id])
    } catch { /* Chat delivery never changes a committed source result. */ }
  }
  return {executed,skipped,errors,results,summary}
})
