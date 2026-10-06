// Persisted archive readers only. Source workflows use native Accountant posting.
export type AccountLedgerAccountType = 'CASH' | 'PRIMARY_BANK' | 'BANK' | 'INVESTMENT' | 'CREDIT'
const enumCast = { accountType: '"AccountLedgerAccountType"' }

export async function accountLedgerBalancesForApi(client: any, input: {
  companyId: string
  accountType: AccountLedgerAccountType
  accountId?: string | null
  from: Date
  to: Date
}) {
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
