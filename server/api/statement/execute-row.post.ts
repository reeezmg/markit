import { defineEventHandler, readBody, createError } from 'h3'
import { executeStatementRow } from '~/server/utils/statement-execution'
export default defineEventHandler(async(event)=>{
  const session=await useAuthSession(event), companyId=session.data?.companyId
  if (!companyId) throw createError({statusCode:401,statusMessage:'Not authenticated'})
  const body=await readBody<{rowId:string;bankAccountId:string;reexecute?:boolean;requestId?:string}>(event)
  if (!body?.rowId || !body.bankAccountId) throw createError({statusCode:400,statusMessage:'rowId and bankAccountId are required'})
  return executeStatementRow(companyId,session.data.id || 'statement',body.rowId,body.bankAccountId,body)
})
