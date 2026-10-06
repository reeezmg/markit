import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { assignStatementOperation } from '~/server/utils/statement-execution'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const rowId = event.context.params?.id
  if (!rowId) throw createError({ statusCode: 400, statusMessage: 'Row ID is required' })

  const body = await readBody<{ operation: string; operationMeta?: any; operationLabel?: string; userInput?: string; reassign?:boolean }>(event)
  if (!body?.operation) throw createError({ statusCode: 400, statusMessage: 'operation is required' })

  // Verify row belongs to this company
  const { rows: rowResults } = await pool.query(
    `SELECT sr.id, sr.description, sr.executed, sb.company_id, sb.status
     FROM statement_rows sr
     JOIN statement_batches sb ON sb.id = sr.batch_id
     WHERE sr.id = $1 AND sb.company_id = $2`,
    [rowId, companyId]
  )
  if (!rowResults.length) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
  if (rowResults[0].executed && body.reassign !== true) throw createError({ statusCode: 400, statusMessage: 'Row already executed' })

  await assignStatementOperation(companyId,rowId,{operation:body.operation,operationMeta:body.operationMeta,operationLabel:body.operationLabel},body.userInput,body.reassign===true)

  return {
    id: rowId,
    operation: body.operation,
    operationMeta: body.operationMeta ?? null,
    operationLabel: body.operationLabel ?? null,
  }
})
