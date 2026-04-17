import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import crypto from 'crypto'
import { executeOperation, deleteExecutedRecord, parseMeta } from './_helpers'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody<{ batchId: string; bankAccountId: string }>(event)
  if (!body?.batchId) throw createError({ statusCode: 400, statusMessage: 'batchId is required' })

  // Fetch batch
  const { rows: batchRows } = await pool.query(
    `SELECT id, chat_id, status FROM statement_batches WHERE id = $1 AND company_id = $2`,
    [body.batchId, companyId]
  )
  if (!batchRows.length) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  if (batchRows[0].status === 'EXECUTED') throw createError({ statusCode: 400, statusMessage: 'Batch already executed' })

  const chatId = batchRows[0].chat_id

  // Fetch all rows
  const { rows } = await pool.query(
    `SELECT id, s_no, date, description, debit, credit, operation, operation_meta, operation_label, executed, execution_result
     FROM statement_rows WHERE batch_id = $1 ORDER BY s_no`,
    [body.batchId]
  )

  // Validate all rows have operations
  const unassigned = rows.filter(r => !r.operation)
  if (unassigned.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `${unassigned.length} row(s) still need operations assigned (S.No: ${unassigned.map(r => r.s_no).join(', ')})`,
    })
  }

  const results: Array<{ sno: number; status: string; operationId?: string; error?: string }> = []
  let executed = 0
  let skipped = 0
  const summary: Record<string, number> = {}

  for (const row of rows) {
    // Skip already executed rows
    if (row.executed) { skipped++; continue }

    // Handle IGNORE
    if (row.operation === 'IGNORE') {
      await pool.query(
        `UPDATE statement_rows SET executed = true, execution_result = $2 WHERE id = $1`,
        [row.id, JSON.stringify({ success: true, skipped: true })]
      )
      skipped++
      summary['Ignored'] = (summary['Ignored'] || 0) + 1
      results.push({ sno: row.s_no, status: 'skipped' })
      continue
    }

    try {
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
      executed++

      // Track summary
      const opLabels: Record<string, string> = {
        EXPENSE: 'Expenses', TRANSFER: 'Transfers', TRANSACTION: 'Transactions',
        DISTRIBUTOR_PAYMENT: 'Distributor Payments', INVESTMENT: 'Investments',
      }
      const label = opLabels[row.operation] || row.operation
      summary[label] = (summary[label] || 0) + 1

      results.push({ sno: row.s_no, status: 'success', operationId: result.operationId ?? undefined })
    } catch (err: any) {
      results.push({ sno: row.s_no, status: 'error', error: err.message })
      await pool.query(
        `UPDATE statement_rows SET execution_result = $2 WHERE id = $1`,
        [row.id, JSON.stringify({ error: err.message })]
      )
    }
  }

  // Mark batch as EXECUTED if any rows succeeded
  if (executed > 0 || skipped > 0) {
    await pool.query(
      `UPDATE statement_batches SET status = 'EXECUTED' WHERE id = $1`,
      [body.batchId]
    )
  }

  // Post summary to AI chat if chatId exists
  const summaryText = Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(', ')
  const errors = results.filter(r => r.status === 'error')
  let chatMessage = `Statement processed: ${summaryText || 'no operations'}.`
  if (executed > 0) chatMessage = `✅ ${chatMessage}`
  if (errors.length) {
    chatMessage += ` ${errors.length} error(s): ${errors.map(e => `Row ${e.sno}: ${e.error}`).join('; ')}`
  }

  if (chatId) {
    try {
      await pool.query(
        `INSERT INTO ai_chat_messages (id, chat_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
        [crypto.randomUUID(), chatId, chatMessage]
      )
      await pool.query(
        `UPDATE ai_chats SET updated_at = now() WHERE id = $1`,
        [chatId]
      )
    } catch { /* non-critical */ }
  }

  return { executed, skipped, errors: errors.length, results, summary: chatMessage }
})
