import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import crypto from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const rowId = event.context.params?.id
  if (!rowId) throw createError({ statusCode: 400, statusMessage: 'Row ID is required' })

  const body = await readBody<{ operation: string; operationMeta?: any; operationLabel?: string; userInput?: string }>(event)
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
  if (rowResults[0].executed) throw createError({ statusCode: 400, statusMessage: 'Row already executed' })
  if (rowResults[0].status === 'EXECUTED') throw createError({ statusCode: 400, statusMessage: 'Batch already executed' })

  // Update row
  await pool.query(
    `UPDATE statement_rows SET operation = $2, operation_meta = $3, operation_label = $4, user_input = $5 WHERE id = $1`,
    [rowId, body.operation, JSON.stringify(body.operationMeta ?? null), body.operationLabel ?? null, body.userInput ?? null]
  )

  // Upsert mapping
  const description = rowResults[0].description
  const { rows: existing } = await pool.query(
    `SELECT id FROM statement_mappings WHERE company_id = $1 AND LOWER(remarks) = LOWER($2) LIMIT 1`,
    [companyId, description]
  )
  if (!existing.length) {
    await pool.query(
      `INSERT INTO statement_mappings (id, company_id, remarks, operation, operation_meta, operation_label, user_input, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [crypto.randomUUID(), companyId, description, body.operation,
       JSON.stringify(body.operationMeta ?? null), body.operationLabel ?? null, body.userInput ?? null]
    )
  } else {
    await pool.query(
      `UPDATE statement_mappings SET operation = $2, operation_meta = $3, operation_label = $4, user_input = $5 WHERE id = $1`,
      [existing[0].id, body.operation, JSON.stringify(body.operationMeta ?? null), body.operationLabel ?? null, body.userInput ?? null]
    )
  }

  return {
    id: rowId,
    operation: body.operation,
    operationMeta: body.operationMeta ?? null,
    operationLabel: body.operationLabel ?? null,
  }
})
