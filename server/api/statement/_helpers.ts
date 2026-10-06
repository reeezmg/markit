import { GoogleGenAI } from '@google/genai'
import { pool } from '~/server/db'
import crypto from 'crypto'
import { selectDistributorAccounts } from '~/server/utils/distributor-account-selection'


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
    pool.query(`SELECT id,name AS bank_name,'' AS account_no FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND account_type='BANK' AND is_active AND deleted_at IS NULL ORDER BY name`, [companyId]),
    Promise.resolve({ rows: [] }),
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
  const amount = statementAmount(row)

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

Only expenses, supplier payments and IGNORE can be executed here. For transfers,
Receive/Pay money or investment/capital activity, return operation="ERROR" and
operationLabel="Use Accountant or Investments for this financial entry".

1. **EXPENSE** — a business expense
\`\`\`json
{ "categoryId": "uuid or null", "categoryName": "category name", "userId": "uuid or null", "userName": "name or null", "note": "optional string or null" }
\`\`\`
Rules: Pick categoryId from the list above by closest match. If the user asks to create a new category not in the list, set categoryId=null and categoryName to the new name. userId/userName are optional — only set if user mentions a person.

2. **DISTRIBUTOR_PAYMENT** — payment to a distributor/supplier
\`\`\`json
{ "distributorId": "uuid", "distributorName": "name", "billNo": "optional string or null", "purchaseOrderNo": "number or null", "remarks": "optional string or null" }
\`\`\`
Rules: Pick distributorId from the distributors list by closest name match. If no match found, return operation="ERROR" with operationLabel explaining the distributor was not found. billNo and purchaseOrderNo only if the user specifically mentions them (e.g. "PO 5" or "purchase order 12"). purchaseOrderNo is the numeric PO number, NOT a uuid.

3. **IGNORE** — skip, no action
Meta: null

Return ONLY valid JSON, no markdown fences, no explanation:
{"operation":"<TYPE>","operationMeta":{...},"operationLabel":"<short label like Expense(Rent) or Supplier payment(Cash→Bank)>"}`

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
  if (!['EXPENSE', 'DISTRIBUTOR_PAYMENT', 'IGNORE'].includes(parsed.operation)) {
    throw new Error('Use Accountant or Investments for this financial entry')
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
  db: any = pool,
  bankAccountId?: string,
): Promise<{ operationId: string | null; insertedData: Record<string, any> }> {
  const amount = statementAmount(row)
  if (operation !== 'IGNORE' && amount <= 0) throw new Error('Statement amount must be positive')
  if (bankAccountId && operation !== 'IGNORE') {
    const bank = await db.query(`SELECT id FROM accountant_v2_accounting_accounts WHERE id=$1 AND company_id=$2 AND account_type='BANK' AND is_active AND deleted_at IS NULL`, [bankAccountId,companyId])
    if (!bank.rows.length) throw new Error('Select an active accounting bank in this company')
  }
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
        await db.query(
          `INSERT INTO expense_categories (id, name, status, company_id, created_at, updated_at) VALUES ($1, $2, true, $3, now(), now())`,
          [categoryId, meta.categoryName, companyId]
        )
      }
      if (!categoryId) throw new Error(`Category "${meta.categoryName || 'unknown'}" not found, please create it first`)
      const category = await db.query('SELECT id FROM expense_categories WHERE id=$1 AND company_id=$2 AND status=true', [categoryId,companyId])
      if (!category.rows.length) throw new Error('Expense category does not belong to this company')
      if (meta.userId) {
        const user=await db.query('SELECT user_id FROM company_users WHERE user_id=$1 AND company_id=$2 AND deleted=false',[meta.userId,companyId])
        if (!user.rows.length) throw new Error('Staff member does not belong to this company')
      }

      const operationId = crypto.randomUUID()
      if (bankAccountId) {
        const settings=await db.query('SELECT accounts,enabled FROM accountant_v2_erp_settings WHERE company_id=$1',[companyId])
        if (!settings.rows[0]?.enabled) throw new Error('Enable expense accounting before executing a statement')
        await db.query(`INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature,accounts) VALUES($1,$2,'{}',$3::jsonb)`,[companyId,'expense:'+operationId,JSON.stringify({...settings.rows[0].accounts,bank:bankAccountId})])
      }
      const note = (meta.note || '') + bankRemark
      const expenseData = { id: operationId, expense_date: txDate, note, payment_mode: 'BANK', status: 'Paid', total_amount: amount, expense_category_id: categoryId, categoryName: meta.categoryName, company_id: companyId, from_id: meta.userId || null, userName: meta.userName || null }
      await db.query(
        `INSERT INTO expenses (id, expense_date, note, payment_mode, status, total_amount, expense_category_id, company_id, from_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'BANK', 'Paid', $4, $5, $6, $7, now(), now())`,
        [operationId, txDate, note, amount, categoryId, companyId, meta.userId || null]
      )

      return { operationId, insertedData: expenseData }
    }

    case 'DISTRIBUTOR_PAYMENT': {
      // Look up distributor by name if distributorId not provided
      if (!meta.distributorId && meta.distributorName) {
        const { rows: dists } = await db.query(
          `SELECT d.id FROM distributors d
           JOIN distributor_companies dc ON dc.distributor_id = d.id
           WHERE LOWER(d.name) LIKE LOWER($1) AND dc.company_id = $2 AND d.status = true LIMIT 1`,
          [`%${meta.distributorName}%`, companyId]
        )
        if (dists.length) meta.distributorId = dists[0].id
      }
      if (!meta.distributorId) throw new Error(`Distributor "${meta.distributorName || 'unknown'}" not found, please create it first`)
      const vendor=await db.query('SELECT distributor_id FROM distributor_companies WHERE distributor_id=$1 AND company_id=$2',[meta.distributorId,companyId])
      if (!vendor.rows.length) throw new Error('Supplier does not belong to this company')
      const operationId = crypto.randomUUID()
      const dpRemarks = (meta.remarks || '') + bankRemark

      // Look up purchase order by number if provided (AI may pass purchaseOrderNo as string/number)
      let purchaseOrderId = meta.purchaseOrderId || null
      if (!purchaseOrderId && meta.purchaseOrderNo) {
        const poNo = parseInt(meta.purchaseOrderNo, 10)
        if (!isNaN(poNo)) {
          const { rows: poRows } = await db.query(
            `SELECT id FROM purchase_orders WHERE purchase_order_no = $1 AND distributor_id = $2 AND company_id = $3 LIMIT 1`,
            [poNo, meta.distributorId, companyId]
          )
          if (!poRows.length) throw new Error('Purchase order not found for this supplier')
          purchaseOrderId = poRows[0].id
        }
      }
      if (purchaseOrderId) {
        const order=await db.query('SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2 AND distributor_id=$3',[purchaseOrderId,companyId,meta.distributorId])
        if (!order.rows.length) throw new Error('Purchase order does not belong to this supplier and company')
      }
      if (bankAccountId) await selectDistributorAccounts(db,companyId,meta.distributorId,'payment:'+operationId,{bank:bankAccountId})

      const dpData = { id: operationId, distributor_id: meta.distributorId, distributorName: meta.distributorName, company_id: companyId, amount, payment_type: 'BANK', remarks: dpRemarks, bill_no: meta.billNo || null, purchase_order_id: purchaseOrderId, created_at: txDate }
      await db.query(
        `INSERT INTO distributor_payments (id, distributor_id, company_id, amount, payment_type, remarks, bill_no, purchase_order_id, created_at)
         VALUES ($1, $2, $3, $4, 'BANK', $5, $6, $7, $8)`,
        [operationId, meta.distributorId, companyId, amount, dpRemarks, meta.billNo || null, purchaseOrderId, txDate]
      )

      return { operationId, insertedData: dpData }
    }

    case 'TRANSFER':
    case 'TRANSACTION':
    case 'INVESTMENT':
      throw new Error('Legacy statement financial operations are read-only. Use Accountant for transfers, Receive/Pay and investments.')

    case 'IGNORE':
      return { operationId: null, insertedData: {} }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// ─── Delete Previously Executed Record (for re-execution) ────────────────────

export async function deleteExecutedRecord(operation: string, executionResult: any, db:any=pool, owner?:string): Promise<void> {
  const opId = executionResult?.operationId
  if (!opId) return

  const tableMap: Record<string, string> = {
    EXPENSE: 'expenses',
    DISTRIBUTOR_PAYMENT: 'distributor_payments',
  }
  const table = tableMap[operation]
  if (!table) throw new Error('Legacy statement financial records are read-only. Use Accountant.')
  const companyId = owner || executionResult?.insertedData?.company_id
  if (!companyId) throw new Error('Statement source company is required')
  await db.query(`DELETE FROM ${table} WHERE id = $1 AND company_id = $2`, [opId, companyId])

}

// ─── Upsert Statement Mapping ────────────────────────────────────────────────

export async function upsertMapping(
  companyId: string,
  description: string,
  operation: string,
  operationMeta: any,
  operationLabel: string,
  userInput?: string,
  db:any=pool,
): Promise<void> {
  const metaJson = JSON.stringify(operationMeta)
  const { rows: existing } = await db.query(
    `SELECT id FROM statement_mappings WHERE company_id = $1 AND LOWER(remarks) = LOWER($2) LIMIT 1`,
    [companyId, description]
  )

  if (!existing.length) {
    await db.query(
      `INSERT INTO statement_mappings (id, company_id, remarks, operation, operation_meta, operation_label, user_input, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [crypto.randomUUID(), companyId, description, operation, metaJson, operationLabel, userInput || null]
    )
  } else {
    await db.query(
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

export function statementAmount(row:{debit?:number|null;credit?:number|null}):number {
  const debit=Number(row.debit ?? 0), credit=Number(row.credit ?? 0)
  if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit<0 || credit<0 || (debit>0 && credit>0)) throw new Error('Invalid statement debit/credit amounts')
  return debit>0 ? debit : credit
}
