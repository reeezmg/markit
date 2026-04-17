import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { fetchCompanyContext, classifyRow, upsertMapping } from './_helpers'

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

  // Update the row with classification + userInput, reset executed state so user must re-execute
  await pool.query(
    `UPDATE statement_rows SET operation = $2, operation_meta = $3, operation_label = $4, user_input = $5, executed = false, execution_result = NULL WHERE id = $1`,
    [body.rowId, result.operation, JSON.stringify(result.operationMeta), result.operationLabel, body.userInput]
  )

  // Save mapping for future auto-match
  await upsertMapping(companyId, row.description, result.operation, result.operationMeta, result.operationLabel, body.userInput)

  return { operation: result.operation, operationLabel: result.operationLabel, operationMeta: result.operationMeta }
})
