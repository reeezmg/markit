import crypto from 'crypto'

export type AccountLedgerAccountType = 'CASH' | 'PRIMARY_BANK' | 'BANK' | 'INVESTMENT' | 'CREDIT'
export type AccountLedgerDirection = 'DEBIT' | 'CREDIT'
export type AccountLedgerSourceType =
  | 'OPENING'
  | 'BILL'
  | 'EXPENSE'
  | 'DISTRIBUTOR_PAYMENT'
  | 'MONEY_TRANSACTION'
  | 'ACCOUNT_TRANSFER'
  | 'INVESTMENT'
  | 'SALARY_PAYMENT'
  | 'USER_CREDIT'

export type AccountLedgerRowInput = {
  companyId: string
  accountType: AccountLedgerAccountType
  accountId?: string | null
  direction: AccountLedgerDirection
  amount: number
  sourceType: AccountLedgerSourceType
  sourceId: string
  entryDate: Date | string
  note?: string | null
}

type AccountKey = {
  companyId: string
  accountType: AccountLedgerAccountType
  accountId: string | null
}

const enumCast = {
  accountType: '"AccountLedgerAccountType"',
  direction: '"AccountLedgerDirection"',
  sourceType: '"AccountLedgerSourceType"',
}

const accountKey = (row: Pick<AccountLedgerRowInput, 'companyId' | 'accountType' | 'accountId'>): string =>
  `${row.companyId}|${row.accountType}|${row.accountId || ''}`

const parseAccountKey = (key: string): AccountKey => {
  const [companyId, accountType, accountId] = key.split('|')
  return { companyId, accountType: accountType as AccountLedgerAccountType, accountId: accountId || null }
}

const normalizeAmount = (value: unknown) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0
}

const normalizeDate = (value: Date | string | null | undefined) => value ? new Date(value) : new Date()

export function ledgerOpeningRows(input: {
  companyId: string
  cash?: number | null
  openingCashDate?: Date | string | null
  bank?: number | null
  openingBankDate?: Date | string | null
}) {
  const rows: AccountLedgerRowInput[] = []

  const cash = normalizeAmount(input.cash)
  if (cash && input.openingCashDate) {
    rows.push({
      companyId: input.companyId,
      accountType: 'CASH',
      accountId: null,
      direction: cash > 0 ? 'CREDIT' : 'DEBIT',
      amount: Math.abs(cash),
      sourceType: 'OPENING',
      sourceId: `${input.companyId}:CASH`,
      entryDate: input.openingCashDate,
      note: 'Cash opening balance',
    })
  }

  const bank = normalizeAmount(input.bank)
  if (bank && input.openingBankDate) {
    rows.push({
      companyId: input.companyId,
      accountType: 'PRIMARY_BANK',
      accountId: null,
      direction: bank > 0 ? 'CREDIT' : 'DEBIT',
      amount: Math.abs(bank),
      sourceType: 'OPENING',
      sourceId: `${input.companyId}:PRIMARY_BANK`,
      entryDate: input.openingBankDate,
      note: 'Primary bank opening balance',
    })
  }

  return rows
}

export function bankOpeningRow(input: {
  companyId: string
  bankId: string
  openingBalance?: number | null
  openingBalanceDate?: Date | string | null
  createdAt?: Date | string | null
  bankName?: string | null
}) {
  const opening = normalizeAmount(input.openingBalance)
  if (!opening) return []
  return [{
    companyId: input.companyId,
    accountType: 'BANK' as const,
    accountId: input.bankId,
    direction: opening > 0 ? 'CREDIT' as const : 'DEBIT' as const,
    amount: Math.abs(opening),
    sourceType: 'OPENING' as const,
    sourceId: input.bankId,
    entryDate: input.openingBalanceDate || input.createdAt || new Date(),
    note: `${input.bankName || 'Bank'} opening balance`,
  }]
}

export function billLedgerRows(bill: {
  id: string
  companyId: string
  paymentMethod?: string | null
  paymentStatus?: string | null
  splitPayments?: any
  grandTotal?: number | string | null
  createdAt?: Date | string | null
  deleted?: boolean | null
  isMarkit?: boolean | null
  invoiceNumber?: number | string | null
}) {
  if (bill.deleted || bill.isMarkit || !['PAID', 'PENDING'].includes(String(bill.paymentStatus || 'PAID'))) return []
  const entryDate = normalizeDate(bill.createdAt)
  const sourceId = bill.id
  const note = bill.invoiceNumber ? `Sale #${bill.invoiceNumber}` : 'Sale'
  const rows: AccountLedgerRowInput[] = []
  const add = (accountType: AccountLedgerAccountType, amount: number) => {
    const normalized = normalizeAmount(amount)
    if (normalized > 0) {
      rows.push({ companyId: bill.companyId, accountType, accountId: null, direction: 'CREDIT', amount: normalized, sourceType: 'BILL', sourceId, entryDate, note })
    }
  }

  if (bill.paymentMethod === 'Split') {
    const split = Array.isArray(bill.splitPayments) ? bill.splitPayments : []
    const totals = split.reduce((acc: Record<string, number>, payment: any) => {
      acc[payment?.method] = (acc[payment?.method] || 0) + Number(payment?.amount || 0)
      return acc
    }, {})
    add('CASH', totals.Cash || 0)
    add('PRIMARY_BANK', Number(totals.UPI || 0) + Number(totals.Card || 0))
    add('CREDIT', totals.Credit || 0)
  } else if (bill.paymentMethod === 'Cash') add('CASH', Number(bill.grandTotal || 0))
  else if (bill.paymentMethod === 'UPI' || bill.paymentMethod === 'Card') add('PRIMARY_BANK', Number(bill.grandTotal || 0))
  else if (bill.paymentMethod === 'Credit') add('CREDIT', Number(bill.grandTotal || 0))

  return rows
}

export function userCreditAccountLedgerRows(entry: {
  id: string
  companyId: string
  type?: string | null
  sourceType?: string | null
  sourceId?: string | null
  amount?: number | string | null
  createdAt?: Date | string | null
  note?: string | null
}) {
  if (entry.sourceType === 'BILL') return []
  const amount = normalizeAmount(entry.amount)
  if (!amount) return []
  if (entry.type === 'USER_CREDIT_BILL') {
    return [{
      companyId: entry.companyId,
      accountType: 'CREDIT' as const,
      accountId: null,
      direction: 'CREDIT' as const,
      amount,
      sourceType: 'USER_CREDIT' as const,
      sourceId: entry.id,
      entryDate: normalizeDate(entry.createdAt),
      note: entry.note || 'User credit',
    }]
  }
  if (entry.type === 'CREDIT_BILL_PAYMENT') {
    return [{
      companyId: entry.companyId,
      accountType: 'CREDIT' as const,
      accountId: null,
      direction: 'DEBIT' as const,
      amount,
      sourceType: 'USER_CREDIT' as const,
      sourceId: entry.id,
      entryDate: normalizeDate(entry.createdAt),
      note: entry.note || 'Credit reduction',
    }]
  }
  return []
}

export function expenseLedgerRows(expense: {
  id: string
  companyId: string
  totalAmount?: number | string | null
  paymentMode?: string | null
  status?: string | null
  expenseDate?: Date | string | null
  note?: string | null
}) {
  if (String(expense.status || '').toUpperCase() !== 'PAID') return []
  const amount = normalizeAmount(expense.totalAmount)
  if (!amount) return []
  const accountType = expense.paymentMode === 'CASH' ? 'CASH' : 'PRIMARY_BANK'
  return [{ companyId: expense.companyId, accountType, accountId: null, direction: 'DEBIT' as const, amount, sourceType: 'EXPENSE' as const, sourceId: expense.id, entryDate: normalizeDate(expense.expenseDate), note: expense.note || 'Expense' }]
}

export function distributorPaymentLedgerRows(payment: {
  id: string
  companyId: string
  amount?: number | string | null
  paymentType?: string | null
  createdAt?: Date | string | null
  remarks?: string | null
}) {
  const amount = normalizeAmount(payment.amount)
  if (!amount) return []
  const accountType = payment.paymentType === 'CASH' ? 'CASH' : 'PRIMARY_BANK'
  return [{ companyId: payment.companyId, accountType, accountId: null, direction: 'DEBIT' as const, amount, sourceType: 'DISTRIBUTOR_PAYMENT' as const, sourceId: payment.id, entryDate: normalizeDate(payment.createdAt), note: payment.remarks || 'Distributor payment' }]
}

export function moneyTransactionLedgerRows(tx: {
  id: string
  companyId: string
  amount?: number | string | null
  paymentMode?: string | null
  accountId?: string | null
  direction?: string | null
  status?: string | null
  createdAt?: Date | string | null
  note?: string | null
}) {
  if (tx.status !== 'PAID') return []
  const amount = normalizeAmount(tx.amount)
  if (!amount) return []
  const accountType = tx.paymentMode === 'CASH' ? 'CASH' : tx.accountId ? 'BANK' : 'PRIMARY_BANK'
  return [{
    companyId: tx.companyId,
    accountType,
    accountId: accountType === 'BANK' ? tx.accountId || null : null,
    direction: tx.direction === 'RECEIVED' ? 'CREDIT' as const : 'DEBIT' as const,
    amount,
    sourceType: 'MONEY_TRANSACTION' as const,
    sourceId: tx.id,
    entryDate: normalizeDate(tx.createdAt),
    note: tx.note || 'Money transaction',
  }]
}

export function transferLedgerRows(transfer: {
  id: string
  companyId: string
  fromType?: string | null
  fromAccountId?: string | null
  toType?: string | null
  toAccountId?: string | null
  amount?: number | string | null
  createdAt?: Date | string | null
  note?: string | null
}) {
  const amount = normalizeAmount(transfer.amount)
  if (!amount) return []
  const entryDate = normalizeDate(transfer.createdAt)
  const rows: AccountLedgerRowInput[] = []
  const resolve = (type?: string | null, accountId?: string | null) => ({
    accountType: type === 'CASH' ? 'CASH' as const : type === 'INVESTMENT' ? 'INVESTMENT' as const : accountId ? 'BANK' as const : 'PRIMARY_BANK' as const,
    accountId: type === 'BANK' && accountId ? accountId : null,
  })
  const from = resolve(transfer.fromType, transfer.fromAccountId)
  const to = resolve(transfer.toType, transfer.toAccountId)
  rows.push({ companyId: transfer.companyId, ...from, direction: 'DEBIT', amount, sourceType: 'ACCOUNT_TRANSFER', sourceId: transfer.id, entryDate, note: transfer.note || 'Account transfer' })
  rows.push({ companyId: transfer.companyId, ...to, direction: 'CREDIT', amount, sourceType: 'ACCOUNT_TRANSFER', sourceId: transfer.id, entryDate, note: transfer.note || 'Account transfer' })
  return rows
}

export function investmentLedgerRows(investment: {
  id: string
  companyId: string
  amount?: number | string | null
  direction?: string | null
  status?: string | null
  createdAt?: Date | string | null
  note?: string | null
}) {
  if (investment.status !== 'COMPLETED') return []
  const amount = normalizeAmount(investment.amount)
  if (!amount) return []
  return [{
    companyId: investment.companyId,
    accountType: 'INVESTMENT' as const,
    accountId: null,
    direction: investment.direction === 'IN' ? 'CREDIT' as const : 'DEBIT' as const,
    amount,
    sourceType: 'INVESTMENT' as const,
    sourceId: investment.id,
    entryDate: normalizeDate(investment.createdAt),
    note: investment.note || 'Investment',
  }]
}

export async function ensureAccountLedgerSchema(client: any) {
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE "AccountLedgerAccountType" AS ENUM ('CASH', 'PRIMARY_BANK', 'BANK', 'INVESTMENT', 'CREDIT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
  await client.query(`ALTER TYPE "AccountLedgerAccountType" ADD VALUE IF NOT EXISTS 'CREDIT'`)
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE "AccountLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE "AccountLedgerSourceType" AS ENUM ('OPENING', 'BILL', 'EXPENSE', 'DISTRIBUTOR_PAYMENT', 'MONEY_TRANSACTION', 'ACCOUNT_TRANSFER', 'INVESTMENT', 'SALARY_PAYMENT', 'USER_CREDIT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS account_ledger_entries (
      id text PRIMARY KEY,
      created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      account_type "AccountLedgerAccountType" NOT NULL,
      account_id text,
      direction "AccountLedgerDirection" NOT NULL,
      amount numeric(12, 2) NOT NULL,
      source_type "AccountLedgerSourceType" NOT NULL,
      source_id text NOT NULL,
      entry_date timestamp(3) without time zone NOT NULL,
      note text,
      balance_after numeric(12, 2)
    )
  `)
  await client.query(`ALTER TABLE account_ledger_entries ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`)
  await client.query(`ALTER TABLE account_ledger_entries ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP`)
  await client.query(`CREATE INDEX IF NOT EXISTS account_ledger_entries_account_idx ON account_ledger_entries(company_id, account_type, account_id, entry_date, id)`)
  await client.query(`CREATE INDEX IF NOT EXISTS account_ledger_entries_source_idx ON account_ledger_entries(company_id, source_type, source_id)`)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_entries_source_unique_idx
    ON account_ledger_entries(company_id, account_type, COALESCE(account_id, '__primary__'), source_type, source_id, direction)
  `)
  await client.query(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance_date timestamp(3) without time zone`)
}

export async function recalculateAccountLedgerBalances(
  client: any,
  account: AccountKey,
  fromDate?: Date | string | null,
) {
  await client.query(
    `
    WITH ordered AS (
      SELECT
        id,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
          OVER (ORDER BY entry_date ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
      FROM account_ledger_entries
      WHERE company_id = $1
        AND account_type = $2::${enumCast.accountType}
        AND account_id IS NOT DISTINCT FROM $3
    )
    UPDATE account_ledger_entries ale
    SET balance_after = ordered.balance,
        updated_at = now()
    FROM ordered
    WHERE ale.id = ordered.id
      AND ($4::timestamp IS NULL OR ale.entry_date >= $4::timestamp)
    `,
    [account.companyId, account.accountType, account.accountId, fromDate ? new Date(fromDate) : null],
  )
}

export async function rebuildAccountLedgerForSource(
  client: any,
  input: {
    companyId: string
    sourceType: AccountLedgerSourceType
    sourceId: string
    rows: AccountLedgerRowInput[]
  },
) {
  await ensureAccountLedgerSchema(client)
  const existing = await client.query(
    `
    SELECT company_id, account_type, account_id, entry_date
    FROM account_ledger_entries
    WHERE company_id = $1
      AND source_type = $2::${enumCast.sourceType}
      AND source_id = $3
    FOR UPDATE
    `,
    [input.companyId, input.sourceType, input.sourceId],
  )

  await client.query(
    `
    DELETE FROM account_ledger_entries
    WHERE company_id = $1
      AND source_type = $2::${enumCast.sourceType}
      AND source_id = $3
    `,
    [input.companyId, input.sourceType, input.sourceId],
  )

  const affected = new Map<string, Date | null>()
  for (const row of existing.rows) {
    const key = accountKey({ companyId: row.company_id, accountType: row.account_type, accountId: row.account_id })
    const oldDate = row.entry_date ? new Date(row.entry_date) : null
    const current = affected.get(key)
    if (!current || (oldDate && oldDate < current)) affected.set(key, oldDate)
  }

  const grouped = new Map<string, AccountLedgerRowInput>()
  for (const row of input.rows) {
    const amount = normalizeAmount(row.amount)
    if (!amount) continue
    const key = `${accountKey(row)}|${row.sourceType}|${row.sourceId}|${row.direction}`
    const existingRow = grouped.get(key)
    if (existingRow) existingRow.amount = normalizeAmount(existingRow.amount + amount)
    else grouped.set(key, { ...row, amount, entryDate: normalizeDate(row.entryDate) })
  }

  for (const row of grouped.values()) {
    await client.query(
      `
      INSERT INTO account_ledger_entries (
        id, company_id, account_type, account_id, direction, amount,
        source_type, source_id, entry_date, note, created_at, updated_at
      )
      VALUES ($1, $2, $3::${enumCast.accountType}, $4, $5::${enumCast.direction}, $6,
        $7::${enumCast.sourceType}, $8, $9, $10, now(), now())
      `,
      [
        crypto.randomUUID(),
        row.companyId,
        row.accountType,
        row.accountId || null,
        row.direction,
        row.amount,
        row.sourceType,
        row.sourceId,
        normalizeDate(row.entryDate),
        row.note || null,
      ],
    )
    const key = accountKey(row)
    const rowDate = normalizeDate(row.entryDate)
    const current = affected.get(key)
    if (!current || rowDate < current) affected.set(key, rowDate)
  }

  for (const [key, fromDate] of affected.entries()) {
    await recalculateAccountLedgerBalances(client, parseAccountKey(key), fromDate)
  }
}

export async function deleteAccountLedgerForSource(
  client: any,
  input: {
    companyId: string
    sourceType: AccountLedgerSourceType
    sourceId: string
  },
) {
  await rebuildAccountLedgerForSource(client, { ...input, rows: [] })
}

export async function deleteAccountLedgerForBill(
  client: any,
  input: {
    companyId: string
    billId: string
  },
) {
  await ensureAccountLedgerSchema(client)
  const existing = await client.query(
    `
    SELECT company_id, account_type, account_id, entry_date
    FROM account_ledger_entries
    WHERE company_id = $1
      AND source_type = 'BILL'
      AND (
        source_id = $2
        OR source_id LIKE $3
      )
    FOR UPDATE
    `,
    [input.companyId, input.billId, `${input.billId}:payment-change:%`],
  )

  await client.query(
    `
    DELETE FROM account_ledger_entries
    WHERE company_id = $1
      AND source_type = 'BILL'
      AND (
        source_id = $2
        OR source_id LIKE $3
      )
    `,
    [input.companyId, input.billId, `${input.billId}:payment-change:%`],
  )

  const affected = new Map<string, Date | null>()
  for (const row of existing.rows) {
    const key = accountKey({ companyId: row.company_id, accountType: row.account_type, accountId: row.account_id })
    const oldDate = row.entry_date ? new Date(row.entry_date) : null
    const current = affected.get(key)
    if (!current || (oldDate && oldDate < current)) affected.set(key, oldDate)
  }

  for (const [key, fromDate] of affected.entries()) {
    await recalculateAccountLedgerBalances(client, parseAccountKey(key), fromDate)
  }
}

export async function accountLedgerBalancesForApi(client: any, input: {
  companyId: string
  accountType: AccountLedgerAccountType
  accountId?: string | null
  from: Date
  to: Date
}) {
  await ensureAccountLedgerSchema(client)
  const openingRes = await client.query(
    `
    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS opening
    FROM account_ledger_entries
    WHERE company_id = $1
      AND account_type = $2::${enumCast.accountType}
      AND account_id IS NOT DISTINCT FROM $3
      AND entry_date < $4
    `,
    [input.companyId, input.accountType, input.accountId || null, input.from],
  )
  const periodRes = await client.query(
    `
    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS period
    FROM account_ledger_entries
    WHERE company_id = $1
      AND account_type = $2::${enumCast.accountType}
      AND account_id IS NOT DISTINCT FROM $3
      AND entry_date BETWEEN $4 AND $5
    `,
    [input.companyId, input.accountType, input.accountId || null, input.from, input.to],
  )

  const openingBalance = Number(openingRes.rows[0]?.opening || 0)
  const closingBalance = openingBalance + Number(periodRes.rows[0]?.period || 0)
  return { openingBalance, closingBalance }
}

export async function accountLedgerRowsForApi(client: any, input: {
  companyId: string
  accountType: AccountLedgerAccountType
  accountId?: string | null
  from: Date
  to: Date
}) {
  await ensureAccountLedgerSchema(client)
  const openingRes = await client.query(
    `
    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS opening
    FROM account_ledger_entries
    WHERE company_id = $1
      AND account_type = $2::${enumCast.accountType}
      AND account_id IS NOT DISTINCT FROM $3
      AND entry_date < $4
    `,
    [input.companyId, input.accountType, input.accountId || null, input.from],
  )
  const rowsRes = await client.query(
    `
    SELECT
      entry_date AS date,
      source_type AS source,
      source_id AS ref,
      COALESCE(note, source_type::text) AS description,
      CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END AS debit,
      CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END AS credit,
      balance_after AS "runningBalance"
    FROM account_ledger_entries
    WHERE company_id = $1
      AND account_type = $2::${enumCast.accountType}
      AND account_id IS NOT DISTINCT FROM $3
      AND entry_date BETWEEN $4 AND $5
    ORDER BY entry_date ASC, id ASC
    `,
    [input.companyId, input.accountType, input.accountId || null, input.from, input.to],
  )

  const openingBalance = Number(openingRes.rows[0]?.opening || 0)
  const openingRow = {
    date: input.from,
    source: 'OPENING',
    ref: '-',
    description: 'Opening Balance',
    debit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    credit: openingBalance > 0 ? openingBalance : 0,
    runningBalance: openingBalance,
  }
  const ledger = [openingRow, ...rowsRes.rows]
  const closingBalance = ledger.length ? Number(ledger[ledger.length - 1].runningBalance || 0) : openingBalance
  return { openingBalance, ledger, closingBalance }
}
