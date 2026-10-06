import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { fetchCompanyContext, classifyRow } from './_helpers'
import { assignStatementOperation } from '~/server/utils/statement-execution'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody<{ rowId: string; userInput: string; bankAccountId: string }>(event)
  if (!body?.rowId || !body?.userInput) {
    throw createError({ statusCode: 400, statusMessage: 'rowId and userInput are required' })
  }
  if (!body.bankAccountId) {
    throw createError({ statusCode: 400, statusMessage: 'bankAccountId is required' })
  }

  // Fetch the row
  const { rows: rowResults } = await pool.query(
    `SELECT sr.id, sr.date, sr.description, sr.debit, sr.credit, sr.batch_id, sb.company_id
     FROM statement_rows sr
     JOIN statement_batches sb ON sb.id = sr.batch_id
     WHERE sr.id = $1 AND sb.company_id = $2`,
    [body.rowId, companyId]
  )
  if (!rowResults.length) throw createError({ statusCode: 404, statusMessage: 'Row not found' })

  const row = rowResults[0]

  // Fetch company context and classify via AI
  const context = await fetchCompanyContext(companyId)
  const result = await classifyRow(
    { description: row.description, debit: row.debit, credit: row.credit, date: row.date },
    body.userInput,
    body.bankAccountId,
    context,
  )

  await assignStatementOperation(companyId,body.rowId,result,body.userInput,true)

  return { operation: result.operation, operationLabel: result.operationLabel, operationMeta: result.operationMeta }
})
