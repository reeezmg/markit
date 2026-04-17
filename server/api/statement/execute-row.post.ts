import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { executeOperation, deleteExecutedRecord, parseMeta } from './_helpers'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody<{ rowId: string; bankAccountId: string }>(event)
  if (!body?.rowId) throw createError({ statusCode: 400, statusMessage: 'rowId is required' })
  if (!body.bankAccountId) throw createError({ statusCode: 400, statusMessage: 'bankAccountId is required' })

  // Fetch the row
  const { rows: rowResults } = await pool.query(
    `SELECT sr.id, sr.date, sr.description, sr.debit, sr.credit, sr.operation, sr.operation_meta, sr.executed, sr.execution_result
     FROM statement_rows sr
     JOIN statement_batches sb ON sb.id = sr.batch_id
     WHERE sr.id = $1 AND sb.company_id = $2`,
    [body.rowId, companyId]
  )
  if (!rowResults.length) throw createError({ statusCode: 404, statusMessage: 'Row not found' })

  const row = rowResults[0]

  if (!row.operation) {
    throw createError({ statusCode: 400, statusMessage: 'Row has no operation assigned. Assign first.' })
  }

  // If already executed, delete old record first (re-execution)
  if (row.executed && row.execution_result) {
    const oldResult = parseMeta(row.execution_result)
    await deleteExecutedRecord(row.operation, oldResult)
  }

  // Handle IGNORE
  if (row.operation === 'IGNORE') {
    await pool.query(
      `UPDATE statement_rows SET executed = true, execution_result = $2 WHERE id = $1`,
      [row.id, JSON.stringify({ success: true, skipped: true })]
    )
    return { success: true, operationId: null, skipped: true }
  }

  // Execute the operation
  const meta = parseMeta(row.operation_meta)
  const result = await executeOperation(
    { id: row.id, description: row.description, debit: row.debit, credit: row.credit, date: row.date },
    row.operation,
    meta,
    companyId,
  )

  // Mark row as executed
  await pool.query(
    `UPDATE statement_rows SET executed = true, execution_result = $2 WHERE id = $1`,
    [row.id, JSON.stringify({ success: true, operationId: result.operationId })]
  )

  return { success: true, operationId: result.operationId, operation: row.operation, meta, insertedData: result.insertedData }
})
