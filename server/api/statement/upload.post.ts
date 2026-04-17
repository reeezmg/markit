import { defineEventHandler, readBody, createError } from 'h3'
import { GoogleGenAI } from '@google/genai'
import { pool } from '~/server/db'
import crypto from 'crypto'

/**
 * Upload a bank statement file (PDF/image), extract rows via Gemini,
 * save to DB, auto-match mappings, and return the batchId.
 * Called from the bank detail page — no AI chat involved.
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined
  if (!companyId || !userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody<{
    file: string       // base64
    mimeType: string   // e.g. 'application/pdf', 'image/jpeg'
    fileName?: string
    bankAccountId?: string
  }>(event)

  if (!body?.file || !body?.mimeType) {
    throw createError({ statusCode: 400, statusMessage: 'file and mimeType are required' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw createError({ statusCode: 500, statusMessage: 'GEMINI_API_KEY not configured' })

  // ─── Step 1: Extract rows via Gemini ───
  const genai = new GoogleGenAI({ apiKey })

  const response = await genai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: body.mimeType, data: body.file } },
          {
            text: `Extract ALL transaction rows from this bank statement. Return ONLY a JSON array, no markdown or explanation.

Each object must have these fields:
- "sno": number (row number starting from 1)
- "date": string (date as shown in statement)
- "description": string (narration/remarks)
- "debit": number or null (withdrawal amount)
- "credit": number or null (deposit amount)
- "balance": number or null (running balance, optional)

Skip summary rows, opening/closing balance rows, and header rows. Only include actual transaction rows.
Return valid JSON array only.`,
          },
        ],
      },
    ],
  })

  const text = response.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('') ?? ''

  // Parse the JSON from Gemini response
  let rows: Array<{ sno: number; date: string; description: string; debit?: number | null; credit?: number | null; balance?: number | null }>
  try {
    // Strip markdown code fences if present
    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    rows = JSON.parse(jsonStr)
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('No rows extracted')
    }
  } catch (err: any) {
    throw createError({ statusCode: 422, statusMessage: `Failed to extract rows from statement: ${err.message}` })
  }

  // ─── Step 2: Save batch + rows to DB ───
  const batchId = crypto.randomUUID()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO statement_batches (id, company_id, user_id, source_file_name, bank_account_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', now())`,
      [batchId, companyId, userId, body.fileName ?? null, body.bankAccountId ?? null]
    )

    for (const row of rows) {
      await client.query(
        `INSERT INTO statement_rows (id, batch_id, s_no, date, description, debit, credit, balance, executed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
        [crypto.randomUUID(), batchId, row.sno, row.date, row.description,
         row.debit ?? null, row.credit ?? null, row.balance ?? null]
      )
    }

    await client.query('COMMIT')
  } catch (err: any) {
    await client.query('ROLLBACK')
    throw createError({ statusCode: 500, statusMessage: `DB error: ${err.message}` })
  } finally {
    client.release()
  }

  // ─── Step 3: Auto-match mappings ───
  let matched = 0
  let unmatched = 0
  try {
    const { rows: stmtRows } = await pool.query(
      `SELECT id, description FROM statement_rows WHERE batch_id = $1 AND operation IS NULL`,
      [batchId]
    )

    const { rows: mappings } = await pool.query(
      `SELECT remarks, operation, operation_meta, operation_label, user_input FROM statement_mappings WHERE company_id = $1`,
      [companyId]
    )

    for (const row of stmtRows) {
      const desc = (row.description || '').toLowerCase().trim()
      let bestMatch = null
      let bestScore = 0

      for (const m of mappings) {
        const mRemarks = (m.remarks || '').toLowerCase().trim()
        // Exact match — highest priority
        if (desc === mRemarks) { bestMatch = m; bestScore = 1; break }
        // Keyword overlap — split on spaces, slashes, hyphens, dots
        const keywords = mRemarks.split(/[\s\/\-\.]+/).filter((w: string) => w.length > 2)
        if (keywords.length === 0) continue
        const matched = keywords.filter((kw: string) => desc.includes(kw)).length
        const score = matched / keywords.length
        // 30% match threshold — catches same UPI ID, account number, company name
        if (score >= 0.3 && score > bestScore) {
          bestMatch = m
          bestScore = score
        }
      }

      if (bestMatch) {
        await pool.query(
          `UPDATE statement_rows SET operation = $2, operation_meta = $3, operation_label = $4, user_input = $5 WHERE id = $1`,
          [row.id, bestMatch.operation, bestMatch.operation_meta, bestMatch.operation_label, bestMatch.user_input ?? null]
        )
        matched++
      } else {
        unmatched++
      }
    }
  } catch { /* non-critical — user can assign manually */ }

  return { batchId, rowCount: rows.length, matched, unmatched }
})
