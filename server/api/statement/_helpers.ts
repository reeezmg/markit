import { GoogleGenAI } from '@google/genai'
import { pool } from '~/server/db'
import crypto from 'crypto'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompanyContext {
  categories: Array<{ id: string; name: string }>
  users: Array<{ user_id: string; name: string }>
  distributors: Array<{ id: string; name: string }>
  bankAccounts: Array<{ id: string; bank_name: string; account_no: string }>
  primaryBank: { bank_name: string; account_no: string } | null
}

export interface ClassifyResult {
  operation: string
  operationMeta: Record<string, any> | null
  operationLabel: string
}

// ─── Fetch Company Context ───────────────────────────────────────────────────

export async function fetchCompanyContext(companyId: string): Promise<CompanyContext> {
  const [catRes, userRes, distRes, bankRes, compRes] = await Promise.all([
    pool.query(`SELECT id, name FROM expense_categories WHERE company_id = $1 AND status = true ORDER BY name`, [companyId]),
    pool.query(`SELECT user_id, name FROM company_users WHERE company_id = $1 AND deleted = false ORDER BY name`, [companyId]),
    pool.query(
      `SELECT d.id, d.name FROM distributors d
       JOIN distributor_companies dc ON dc.distributor_id = d.id
       WHERE dc.company_id = $1 AND d.status = true ORDER BY d.name`,
      [companyId]
    ),
    pool.query(`SELECT id, bank_name, account_no FROM bank_accounts WHERE company_id = $1`, [companyId]),
    pool.query(`SELECT bank_name, account_no FROM companies WHERE id = $1`, [companyId]),
  ])

  return {
    categories: catRes.rows,
    users: userRes.rows,
    distributors: distRes.rows,
    bankAccounts: bankRes.rows,
    primaryBank: compRes.rows[0] ?? null,
  }
}

// ─── Classify Row via AI ─────────────────────────────────────────────────────

export async function classifyRow(
  row: { description: string; debit?: number | null; credit?: number | null; date: string },
  userInput: string,
  bankAccountId: string,
  context: CompanyContext,
): Promise<ClassifyResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const isDebit = (row.debit ?? 0) > 0
  const amount = row.debit ?? row.credit ?? 0

  const categoryList = context.categories.length
    ? context.categories.map(c => `- "${c.name}" (id: ${c.id})`).join('\n')
    : '(none)'

  const userList = context.users.length
    ? context.users.map(u => `- "${u.name}" (userId: ${u.user_id})`).join('\n')
    : '(none)'

  const distributorList = context.distributors.length
    ? context.distributors.map(d => `- "${d.name}" (id: ${d.id})`).join('\n')
    : '(none)'

  const bankList: string[] = []
  if (context.primaryBank?.bank_name) {
    bankList.push(`- "${context.primaryBank.bank_name} ${context.primaryBank.account_no || ''}" (id: PRIMARY) — Primary account`)
  }
  for (const b of context.bankAccounts) {
    bankList.push(`- "${b.bank_name || 'Bank'} ${b.account_no || ''}" (id: ${b.id})`)
  }
  const bankListStr = bankList.length ? bankList.join('\n') : '(none)'

  const prompt = `You are a bank statement classifier for a retail store management app.

Given a bank statement row and the user's instruction, classify the operation and return structured meta with actual IDs from the database.

**Statement row:**
- Description: "${row.description}"
- ${isDebit ? `Debit (withdrawal): ₹${amount}` : `Credit (deposit): ₹${amount}`}
- Date: ${row.date}

**User says:** "${userInput}"

**Selected bank account ID:** ${bankAccountId}

**Available data:**

Expense Categories:
${categoryList}

Company Users (staff/partners):
${userList}

Distributors/Suppliers:
${distributorList}

Bank Accounts:
${bankListStr}

**Operations and their exact JSON meta format:**

1. **EXPENSE** — a business expense
\`\`\`json
{ "categoryId": "uuid or null", "categoryName": "category name", "userId": "uuid or null", "userName": "name or null", "note": "optional string or null" }
\`\`\`
Rules: Pick categoryId from the list above by closest match. If the user asks to create a new category not in the list, set categoryId=null and categoryName to the new name. userId/userName are optional — only set if user mentions a person.

2. **TRANSFER** — money moved between accounts
\`\`\`json
{ "fromType": "BANK|CASH|INVESTMENT", "fromAccountId": "uuid or null", "toType": "BANK|CASH|INVESTMENT", "toAccountId": "uuid or null", "note": "optional string or null" }
\`\`\`
Rules: If debit row, fromType=BANK and fromAccountId=${bankAccountId}. Figure out toType and toAccountId. If credit row, toType=BANK and toAccountId=${bankAccountId}. Figure out fromType and fromAccountId. If the other side is BANK, pick the account from the bank accounts list. If CASH or INVESTMENT, set accountId to null.

3. **TRANSACTION** — money given to or received from a party
\`\`\`json
{ "partyType": "CUSTOMER|SUPPLIER|EMPLOYEE|OWNER|OTHER", "direction": "GIVEN|RECEIVED", "accountId": "uuid or null", "note": "optional string or null" }
\`\`\`
Rules: GIVEN = debit (money went out), RECEIVED = credit (money came in). accountId = ${bankAccountId}. Pick the partyType based on context.

4. **DISTRIBUTOR_PAYMENT** — payment to a distributor/supplier
\`\`\`json
{ "distributorId": "uuid", "distributorName": "name", "billNo": "optional string or null", "purchaseOrderNo": "number or null", "remarks": "optional string or null" }
\`\`\`
Rules: Pick distributorId from the distributors list by closest name match. If no match found, return operation="ERROR" with operationLabel explaining the distributor was not found. billNo and purchaseOrderNo only if the user specifically mentions them (e.g. "PO 5" or "purchase order 12"). purchaseOrderNo is the numeric PO number, NOT a uuid.

5. **INVESTMENT** — capital invested in or withdrawn from business
\`\`\`json
{ "userId": "uuid", "userName": "name", "direction": "IN|OUT" }
\`\`\`
Rules: Pick userId from the company users list. IN = money coming into business (credit), OUT = money going out / drawings (debit). Only classify as INVESTMENT if user explicitly mentions investment/capital/drawing.

6. **IGNORE** — skip, no action
Meta: null

Return ONLY valid JSON, no markdown fences, no explanation:
{"operation":"<TYPE>","operationMeta":{...},"operationLabel":"<short label like Expense(Rent) or Transfer(Cash→Bank)>"}`

  const genai = new GoogleGenAI({ apiKey })
  const response = await genai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  })

  const text = response.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('') ?? ''

  const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Could not understand your input, please rewrite it more clearly')
  }

  if (!parsed.operation || !parsed.operationLabel) {
    throw new Error('Could not understand your input, please rewrite it more clearly')
  }

  if (parsed.operation === 'ERROR') {
    throw new Error(parsed.operationLabel || 'Could not classify this row, please rewrite your input')
  }

  return {
    operation: parsed.operation,
    operationMeta: parsed.operationMeta ?? null,
    operationLabel: parsed.operationLabel,
  }
}

// ─── Execute Operation — Create DB Record ────────────────────────────────────

export async function executeOperation(
  row: { id: string; description: string; debit?: number | null; credit?: number | null; date: string },
  operation: string,
  meta: Record<string, any>,
  companyId: string,
): Promise<{ operationId: string | null; insertedData: Record<string, any> }> {
  const amount = row.debit ?? row.credit ?? 0
  const bankRemark = row.description ? ` [${row.description}]` : ''
  let txDate: string
  try {
    // Bank dates are DD/MM/YYYY or DD-MM-YYYY — parse as IST (UTC+5:30)
    const parts = row.date.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
    if (parts) {
      const dd = parts[1].padStart(2, '0'), mm = parts[2].padStart(2, '0')
      const yyyy = parts[3].length === 2 ? '20' + parts[3] : parts[3]
      txDate = `${yyyy}-${mm}-${dd}T00:00:00+05:30`
    } else {
      const d = new Date(row.date)
      txDate = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
    }
  } catch {
    txDate = new Date().toISOString()
  }

  switch (operation) {
    case 'EXPENSE': {
      let categoryId = meta.categoryId
      if (!categoryId && meta.categoryName) {
        // Auto-create category
        categoryId = crypto.randomUUID()
        await pool.query(
          `INSERT INTO expense_categories (id, name, status, company_id, created_at, updated_at) VALUES ($1, $2, true, $3, now(), now())`,
          [categoryId, meta.categoryName, companyId]
        )
      }
      if (!categoryId) throw new Error(`Category "${meta.categoryName || 'unknown'}" not found, please create it first`)

      const operationId = crypto.randomUUID()
      const note = (meta.note || '') + bankRemark
      const expenseData = { id: operationId, expense_date: txDate, note, payment_mode: 'BANK', status: 'Paid', total_amount: amount, expense_category_id: categoryId, categoryName: meta.categoryName, company_id: companyId, from_id: meta.userId || null, userName: meta.userName || null }
      await pool.query(
        `INSERT INTO expenses (id, expense_date, note, payment_mode, status, total_amount, expense_category_id, company_id, from_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'BANK', 'Paid', $4, $5, $6, $7, now(), now())`,
        [operationId, txDate, note, amount, categoryId, companyId, meta.userId || null]
      )
      return { operationId, insertedData: expenseData }
    }

    case 'TRANSFER': {
      const operationId = crypto.randomUUID()
      const fromAccountId = meta.fromAccountId === 'PRIMARY' ? null : (meta.fromAccountId || null)
      const toAccountId = meta.toAccountId === 'PRIMARY' ? null : (meta.toAccountId || null)
      const transferNote = (meta.note || '') + bankRemark
      const transferData = { id: operationId, company_id: companyId, from_type: meta.fromType, to_type: meta.toType, from_account_id: fromAccountId, to_account_id: toAccountId, amount, note: transferNote, created_at: txDate }
      await pool.query(
        `INSERT INTO account_transfers (id, company_id, from_type, to_type, from_account_id, to_account_id, amount, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [operationId, companyId, meta.fromType, meta.toType, fromAccountId, toAccountId, amount, transferNote, txDate]
      )
      return { operationId, insertedData: transferData }
    }

    case 'TRANSACTION': {
      const operationId = crypto.randomUUID()
      const accountId = meta.accountId === 'PRIMARY' ? null : (meta.accountId || null)
      const txNote = (meta.note || '') + bankRemark
      const txData = { id: operationId, company_id: companyId, party_type: meta.partyType || 'OTHER', direction: meta.direction, status: 'PAID', amount, payment_mode: 'BANK', account_id: accountId, note: txNote, created_at: txDate }
      await pool.query(
        `INSERT INTO money_transactions (id, company_id, party_type, direction, status, amount, payment_mode, account_id, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PAID', $5, 'BANK', $6, $7, $8, now())`,
        [operationId, companyId, meta.partyType || 'OTHER', meta.direction, amount, accountId, txNote, txDate]
      )
      return { operationId, insertedData: txData }
    }

    case 'DISTRIBUTOR_PAYMENT': {
      // Look up distributor by name if distributorId not provided
      if (!meta.distributorId && meta.distributorName) {
        const { rows: dists } = await pool.query(
          `SELECT d.id FROM distributors d
           JOIN distributor_companies dc ON dc.distributor_id = d.id
           WHERE LOWER(d.name) LIKE LOWER($1) AND dc.company_id = $2 AND d.status = true LIMIT 1`,
          [`%${meta.distributorName}%`, companyId]
        )
        if (dists.length) meta.distributorId = dists[0].id
      }
      if (!meta.distributorId) throw new Error(`Distributor "${meta.distributorName || 'unknown'}" not found, please create it first`)
      const operationId = crypto.randomUUID()
      const dpRemarks = (meta.remarks || '') + bankRemark

      // Look up purchase order by number if provided (AI may pass purchaseOrderNo as string/number)
      let purchaseOrderId = meta.purchaseOrderId || null
      if (!purchaseOrderId && meta.purchaseOrderNo) {
        const poNo = parseInt(meta.purchaseOrderNo, 10)
        if (!isNaN(poNo)) {
          const { rows: poRows } = await pool.query(
            `SELECT id FROM purchase_orders WHERE purchase_order_no = $1 AND distributor_id = $2 AND company_id = $3 LIMIT 1`,
            [poNo, meta.distributorId, companyId]
          )
          if (poRows.length) purchaseOrderId = poRows[0].id
        }
      }

      const dpData = { id: operationId, distributor_id: meta.distributorId, distributorName: meta.distributorName, company_id: companyId, amount, payment_type: 'BANK', remarks: dpRemarks, bill_no: meta.billNo || null, purchase_order_id: purchaseOrderId, created_at: txDate }
      await pool.query(
        `INSERT INTO distributor_payments (id, distributor_id, company_id, amount, payment_type, remarks, bill_no, purchase_order_id, created_at)
         VALUES ($1, $2, $3, $4, 'BANK', $5, $6, $7, $8)`,
        [operationId, meta.distributorId, companyId, amount, dpRemarks, meta.billNo || null, purchaseOrderId, txDate]
      )
      return { operationId, insertedData: dpData }
    }

    case 'INVESTMENT': {
      let userId = meta.userId
      // Look up user by name if userId not provided
      if (!userId && meta.userName) {
        const { rows: users } = await pool.query(
          `SELECT user_id FROM company_users WHERE LOWER(name) LIKE LOWER($1) AND company_id = $2 AND deleted = false LIMIT 1`,
          [`%${meta.userName}%`, companyId]
        )
        if (users.length) userId = users[0].user_id
      }
      if (!userId) throw new Error(`User "${meta.userName || 'unknown'}" not found, please create it first`)
      const operationId = crypto.randomUUID()
      const invNote = (meta.note || '') + bankRemark
      const invData = { id: operationId, company_id: companyId, userId, userName: meta.userName, direction: meta.direction || 'IN', amount, payment_mode: 'BANK', status: 'COMPLETED', note: invNote, created_at: txDate }
      await pool.query(
        `INSERT INTO investments (id, company_id, "userId", direction, amount, payment_mode, status, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'BANK', 'COMPLETED', $6, $7, now())`,
        [operationId, companyId, userId, meta.direction || 'IN', amount, invNote, txDate]
      )
      return { operationId, insertedData: invData }
    }

    case 'IGNORE':
      return { operationId: null, insertedData: {} }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// ─── Delete Previously Executed Record (for re-execution) ────────────────────

export async function deleteExecutedRecord(operation: string, executionResult: any): Promise<void> {
  const opId = executionResult?.operationId
  if (!opId) return

  const tableMap: Record<string, string> = {
    EXPENSE: 'expenses',
    TRANSFER: 'account_transfers',
    TRANSACTION: 'money_transactions',
    DISTRIBUTOR_PAYMENT: 'distributor_payments',
    INVESTMENT: 'investments',
  }
  const table = tableMap[operation]
  if (table) {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [opId])
  }
}

// ─── Upsert Statement Mapping ────────────────────────────────────────────────

export async function upsertMapping(
  companyId: string,
  description: string,
  operation: string,
  operationMeta: any,
  operationLabel: string,
  userInput?: string,
): Promise<void> {
  const metaJson = JSON.stringify(operationMeta)
  const { rows: existing } = await pool.query(
    `SELECT id FROM statement_mappings WHERE company_id = $1 AND LOWER(remarks) = LOWER($2) LIMIT 1`,
    [companyId, description]
  )

  if (!existing.length) {
    await pool.query(
      `INSERT INTO statement_mappings (id, company_id, remarks, operation, operation_meta, operation_label, user_input, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [crypto.randomUUID(), companyId, description, operation, metaJson, operationLabel, userInput || null]
    )
  } else {
    await pool.query(
      `UPDATE statement_mappings SET operation = $2, operation_meta = $3, operation_label = $4, user_input = $5 WHERE id = $1`,
      [existing[0].id, operation, metaJson, operationLabel, userInput || null]
    )
  }
}

// ─── Parse Meta Helper ───────────────────────────────────────────────────────

export function parseMeta(raw: any): Record<string, any> {
  if (!raw) return {}
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}
