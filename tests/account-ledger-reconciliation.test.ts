import 'dotenv/config'
import { Pool } from 'pg'

type Row = Record<string, any>

const companyId = process.env.COMPANY_ID || process.env.ACCOUNT_LEDGER_TEST_COMPANY_ID || null
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run account ledger reconciliation.')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })

const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

function printRows(title: string, rows: Row[]) {
  console.error(`\n${title}`)
  console.error(JSON.stringify(rows.slice(0, 50), null, 2))
  if (rows.length > 50) console.error(`...and ${rows.length - 50} more`)
}

async function assertNoRows(name: string, sql: string, params: any[] = []) {
  const res = await pool.query(sql, params)
  if (res.rows.length) {
    printRows(`${name} failed (${res.rows.length} row(s))`, res.rows)
    throw new Error(name)
  }
  console.log(`OK ${name}`)
}

async function main() {
  console.log('Account ledger reconciliation')
  console.log(companyId ? `Company: ${companyId}` : 'Company: all')

  await assertNoRows(
    'ledger rows match source data',
    `
    WITH expected_raw AS (
      SELECT
        c.id AS company_id,
        'CASH'::text AS account_type,
        NULL::text AS account_id,
        CASE WHEN c.cash >= 0 THEN 'CREDIT' ELSE 'DEBIT' END::text AS direction,
        ABS(c.cash)::numeric AS amount,
        'OPENING'::text AS source_type,
        c.id || ':CASH' AS source_id,
        c.opening_cash_date AS entry_date
      FROM companies c
      WHERE COALESCE(c.cash, 0) <> 0
        AND c.opening_cash_date IS NOT NULL
        AND ($1::text IS NULL OR c.id = $1::text)

      UNION ALL
      SELECT
        c.id,
        'PRIMARY_BANK',
        NULL::text,
        CASE WHEN c.bank >= 0 THEN 'CREDIT' ELSE 'DEBIT' END,
        ABS(c.bank)::numeric,
        'OPENING',
        c.id || ':PRIMARY_BANK',
        c.opening_bank_date
      FROM companies c
      WHERE COALESCE(c.bank, 0) <> 0
        AND c.opening_bank_date IS NOT NULL
        AND ($1::text IS NULL OR c.id = $1::text)

      UNION ALL
      SELECT
        b.company_id,
        'BANK',
        b.id,
        CASE WHEN b.opening_balance >= 0 THEN 'CREDIT' ELSE 'DEBIT' END,
        ABS(b.opening_balance)::numeric,
        'OPENING',
        b.id,
        COALESCE(b.opening_balance_date, b."createdAt")
      FROM bank_accounts b
      WHERE COALESCE(b.opening_balance, 0) <> 0
        AND ($1::text IS NULL OR b.company_id = $1::text)

      UNION ALL
      SELECT company_id, account_type, account_id, 'CREDIT', SUM(amount)::numeric, 'BILL', id, created_at
      FROM (
        SELECT b.id, b.company_id, b.created_at, 'CASH'::text AS account_type, NULL::text AS account_id, b.grand_total::numeric AS amount
        FROM bills b
        WHERE b.payment_method = 'Cash'
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND ($1::text IS NULL OR b.company_id = $1::text)

        UNION ALL
        SELECT
          b.id,
          b.company_id,
          b.created_at,
          CASE WHEN elem->>'method' = 'Cash' THEN 'CASH' ELSE 'PRIMARY_BANK' END,
          NULL::text,
          (elem->>'amount')::numeric
        FROM bills b
        JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN b.split_payments IS NOT NULL AND jsonb_typeof(b.split_payments::jsonb) = 'array' THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem ON true
        WHERE b.payment_method = 'Split'
          AND elem->>'method' IN ('Cash','UPI','Card')
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND ($1::text IS NULL OR b.company_id = $1::text)

        UNION ALL
        SELECT b.id, b.company_id, b.created_at, 'PRIMARY_BANK', NULL::text, b.grand_total::numeric
        FROM bills b
        WHERE b.payment_method IN ('UPI','Card')
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND ($1::text IS NULL OR b.company_id = $1::text)
      ) bill_rows
      WHERE amount > 0
      GROUP BY company_id, account_type, account_id, id, created_at

      UNION ALL
      SELECT
        e.company_id,
        CASE WHEN e.payment_mode = 'CASH' THEN 'CASH' ELSE 'PRIMARY_BANK' END,
        NULL::text,
        'DEBIT',
        e.total_amount::numeric,
        'EXPENSE',
        e.id,
        e.expense_date
      FROM expenses e
      WHERE UPPER(e.status) = 'PAID'
        AND COALESCE(e.total_amount, 0) > 0
        AND ($1::text IS NULL OR e.company_id = $1::text)

      UNION ALL
      SELECT
        dp.company_id,
        CASE WHEN dp.payment_type = 'CASH' THEN 'CASH' ELSE 'PRIMARY_BANK' END,
        NULL::text,
        'DEBIT',
        dp.amount::numeric,
        'DISTRIBUTOR_PAYMENT',
        dp.id,
        dp.created_at
      FROM distributor_payments dp
      WHERE COALESCE(dp.amount, 0) > 0
        AND ($1::text IS NULL OR dp.company_id = $1::text)

      UNION ALL
      SELECT
        mt.company_id,
        CASE WHEN mt.payment_mode = 'CASH' THEN 'CASH' WHEN mt.account_id IS NULL THEN 'PRIMARY_BANK' ELSE 'BANK' END,
        CASE WHEN mt.payment_mode <> 'CASH' AND mt.account_id IS NOT NULL THEN mt.account_id ELSE NULL END,
        CASE WHEN mt.direction = 'RECEIVED' THEN 'CREDIT' ELSE 'DEBIT' END,
        mt.amount::numeric,
        'MONEY_TRANSACTION',
        mt.id,
        mt.created_at
      FROM money_transactions mt
      WHERE mt.status = 'PAID'
        AND COALESCE(mt.amount, 0) > 0
        AND ($1::text IS NULL OR mt.company_id = $1::text)

      UNION ALL
      SELECT
        at.company_id,
        CASE WHEN at.from_type = 'CASH' THEN 'CASH' WHEN at.from_type = 'INVESTMENT' THEN 'INVESTMENT' WHEN at.from_account_id IS NULL THEN 'PRIMARY_BANK' ELSE 'BANK' END,
        CASE WHEN at.from_type = 'BANK' AND at.from_account_id IS NOT NULL THEN at.from_account_id ELSE NULL END,
        'DEBIT',
        at.amount::numeric,
        'ACCOUNT_TRANSFER',
        at.id,
        at.created_at
      FROM account_transfers at
      WHERE COALESCE(at.amount, 0) > 0
        AND ($1::text IS NULL OR at.company_id = $1::text)

      UNION ALL
      SELECT
        at.company_id,
        CASE WHEN at.to_type = 'CASH' THEN 'CASH' WHEN at.to_type = 'INVESTMENT' THEN 'INVESTMENT' WHEN at.to_account_id IS NULL THEN 'PRIMARY_BANK' ELSE 'BANK' END,
        CASE WHEN at.to_type = 'BANK' AND at.to_account_id IS NOT NULL THEN at.to_account_id ELSE NULL END,
        'CREDIT',
        at.amount::numeric,
        'ACCOUNT_TRANSFER',
        at.id,
        at.created_at
      FROM account_transfers at
      WHERE COALESCE(at.amount, 0) > 0
        AND ($1::text IS NULL OR at.company_id = $1::text)

      UNION ALL
      SELECT
        i.company_id,
        'INVESTMENT',
        NULL::text,
        CASE WHEN i.direction = 'IN' THEN 'CREDIT' ELSE 'DEBIT' END,
        i.amount::numeric,
        'INVESTMENT',
        i.id,
        i.created_at
      FROM investments i
      WHERE i.status = 'COMPLETED'
        AND COALESCE(i.amount, 0) > 0
        AND ($1::text IS NULL OR i.company_id = $1::text)
    ),
    expected AS (
      SELECT
        company_id,
        account_type,
        COALESCE(account_id, '') AS account_id_key,
        direction,
        source_type,
        source_id,
        MIN(entry_date)::timestamp(3) AS entry_date,
        ROUND(SUM(amount)::numeric, 2) AS amount
      FROM expected_raw
      WHERE COALESCE(amount, 0) > 0
      GROUP BY company_id, account_type, COALESCE(account_id, ''), direction, source_type, source_id
    ),
    actual AS (
      SELECT
        company_id,
        account_type::text AS account_type,
        COALESCE(account_id, '') AS account_id_key,
        direction::text AS direction,
        source_type::text AS source_type,
        source_id,
        MIN(entry_date)::timestamp(3) AS entry_date,
        ROUND(SUM(amount)::numeric, 2) AS amount,
        COUNT(*) AS ledger_row_count
      FROM account_ledger_entries
      WHERE ($1::text IS NULL OR company_id = $1::text)
      GROUP BY company_id, account_type::text, COALESCE(account_id, ''), direction::text, source_type::text, source_id
    )
    SELECT
      COALESCE(e.company_id, a.company_id) AS company_id,
      COALESCE(e.account_type, a.account_type) AS account_type,
      NULLIF(COALESCE(e.account_id_key, a.account_id_key), '') AS account_id,
      COALESCE(e.direction, a.direction) AS direction,
      COALESCE(e.source_type, a.source_type) AS source_type,
      COALESCE(e.source_id, a.source_id) AS source_id,
      e.amount AS expected_amount,
      a.amount AS ledger_amount,
      e.entry_date AS expected_date,
      a.entry_date AS ledger_date,
      CASE
        WHEN e.source_id IS NULL THEN 'EXTRA_LEDGER_ROW'
        WHEN a.source_id IS NULL THEN 'MISSING_LEDGER_ROW'
        WHEN e.amount <> a.amount THEN 'AMOUNT_MISMATCH'
        WHEN e.entry_date IS DISTINCT FROM a.entry_date THEN 'DATE_MISMATCH'
        ELSE 'UNKNOWN'
      END AS reason
    FROM expected e
    FULL OUTER JOIN actual a
      ON a.company_id = e.company_id
      AND a.account_type = e.account_type
      AND a.account_id_key = e.account_id_key
      AND a.direction = e.direction
      AND a.source_type = e.source_type
      AND a.source_id = e.source_id
    WHERE e.source_id IS NULL
      OR a.source_id IS NULL
      OR e.amount <> a.amount
      OR e.entry_date IS DISTINCT FROM a.entry_date
    ORDER BY company_id, source_type, source_id, account_type, direction
    `,
    [companyId],
  )

  await assertNoRows(
    'ledger has no duplicate source/account/direction rows',
    `
    SELECT
      company_id,
      account_type,
      account_id,
      source_type,
      source_id,
      direction,
      COUNT(*) AS row_count,
      SUM(amount) AS amount
    FROM account_ledger_entries
    WHERE ($1::text IS NULL OR company_id = $1::text)
    GROUP BY company_id, account_type, account_id, source_type, source_id, direction
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC, company_id, source_type, source_id
    `,
    [companyId],
  )

  await assertNoRows(
    'ledger balance_after is correct running balance',
    `
    WITH ordered AS (
      SELECT
        id,
        company_id,
        account_type,
        account_id,
        entry_date,
        direction,
        amount,
        balance_after,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
          OVER (
            PARTITION BY company_id, account_type, account_id
            ORDER BY entry_date ASC, id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS expected_balance
      FROM account_ledger_entries
      WHERE ($1::text IS NULL OR company_id = $1::text)
    )
    SELECT
      company_id,
      account_type,
      account_id,
      id,
      entry_date,
      direction,
      amount,
      balance_after AS ledger_balance,
      expected_balance
    FROM ordered
    WHERE ROUND(COALESCE(balance_after, 0)::numeric, 2) <> ROUND(expected_balance::numeric, 2)
    ORDER BY company_id, account_type, account_id, entry_date, id
    `,
    [companyId],
  )

  const totals = await pool.query(
    `
    SELECT
      company_id,
      account_type,
      account_id,
      COUNT(*) AS rows,
      ROUND(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END)::numeric, 2) AS credits,
      ROUND(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END)::numeric, 2) AS debits,
      ROUND(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)::numeric, 2) AS closing
    FROM account_ledger_entries
    WHERE ($1::text IS NULL OR company_id = $1::text)
    GROUP BY company_id, account_type, account_id
    ORDER BY company_id, account_type, account_id
    `,
    [companyId],
  )

  console.log('\nLedger totals')
  for (const row of totals.rows) {
    console.log(`${row.company_id} ${row.account_type}${row.account_id ? `:${row.account_id}` : ''} rows=${row.rows} credits=${money(row.credits)} debits=${money(row.debits)} closing=${money(row.closing)}`)
  }
}

main()
  .then(async () => {
    await pool.end()
    console.log('\nAccount ledger reconciliation passed.')
  })
  .catch(async (error) => {
    await pool.end()
    console.error(`\nAccount ledger reconciliation failed: ${error.message}`)
    process.exit(1)
  })
