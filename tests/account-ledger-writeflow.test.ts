import 'dotenv/config'
import { Pool } from 'pg'
import {
  billLedgerRows,
  deleteAccountLedgerForSource,
  distributorPaymentLedgerRows,
  expenseLedgerRows,
  investmentLedgerRows,
  moneyTransactionLedgerRows,
  rebuildAccountLedgerForSource,
  transferLedgerRows,
  type AccountLedgerSourceType,
} from '../server/utils/account-ledger'

const companyId = process.env.COMPANY_ID || process.env.ACCOUNT_LEDGER_TEST_COMPANY_ID
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run account ledger writeflow test.')
  process.exit(1)
}

if (!companyId) {
  console.error('COMPANY_ID is required to run account ledger writeflow test.')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })
const testDate = new Date('2099-01-15T10:00:00.000Z')
const runId = `account-ledger-writeflow-${Date.now()}`

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function amount(value: unknown) {
  return Number(Number(value || 0).toFixed(2))
}

async function sourceRows(client: any, sourceType: AccountLedgerSourceType, sourceId: string) {
  const res = await client.query(
    `
    SELECT
      company_id,
      account_type::text AS account_type,
      account_id,
      direction::text AS direction,
      amount,
      source_type::text AS source_type,
      source_id,
      entry_date,
      balance_after
    FROM account_ledger_entries
    WHERE company_id = $1
      AND source_type = $2::"AccountLedgerSourceType"
      AND source_id = $3
    ORDER BY account_type, account_id, direction
    `,
    [companyId, sourceType, sourceId],
  )
  return res.rows
}

async function assertRows(client: any, sourceType: AccountLedgerSourceType, sourceId: string, expected: Array<{
  accountType: string
  accountId?: string | null
  direction: string
  amount: number
}>) {
  const rows = await sourceRows(client, sourceType, sourceId)
  const compact = rows.map((row: any) => ({
    accountType: row.account_type,
    accountId: row.account_id || null,
    direction: row.direction,
    amount: amount(row.amount),
  }))
  const sortedExpected = [...expected].map((row) => ({
    accountType: row.accountType,
    accountId: row.accountId || null,
    direction: row.direction,
    amount: amount(row.amount),
  })).sort((a, b) => `${a.accountType}|${a.accountId}|${a.direction}`.localeCompare(`${b.accountType}|${b.accountId}|${b.direction}`))

  assert(JSON.stringify(compact) === JSON.stringify(sortedExpected), `${sourceType}/${sourceId} mismatch. expected ${JSON.stringify(sortedExpected)} got ${JSON.stringify(compact)}`)
}

async function assertNoRows(client: any, sourceType: AccountLedgerSourceType, sourceId: string) {
  const rows = await sourceRows(client, sourceType, sourceId)
  assert(rows.length === 0, `${sourceType}/${sourceId} should have no ledger rows, got ${JSON.stringify(rows)}`)
}

async function assertRunningBalance(client: any) {
  const res = await client.query(
    `
    WITH ordered AS (
      SELECT
        id,
        balance_after,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
          OVER (
            PARTITION BY company_id, account_type, account_id
            ORDER BY entry_date ASC, id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS expected_balance
      FROM account_ledger_entries
      WHERE company_id = $1
    )
    SELECT id, balance_after, expected_balance
    FROM ordered
    WHERE ROUND(COALESCE(balance_after, 0)::numeric, 2) <> ROUND(expected_balance::numeric, 2)
    LIMIT 10
    `,
    [companyId],
  )
  assert(res.rows.length === 0, `running balance mismatch: ${JSON.stringify(res.rows)}`)
}

async function main() {
  const client = await pool.connect()
  try {
    console.log(`Account ledger writeflow test for ${companyId}`)
    await client.query('BEGIN')

    const bankRes = await client.query(`SELECT id FROM bank_accounts WHERE company_id = $1 ORDER BY "createdAt" LIMIT 1`, [companyId])
    const bankId = bankRes.rows[0]?.id as string | undefined

    const billId = `${runId}:bill`
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'BILL',
      sourceId: billId,
      rows: billLedgerRows({ id: billId, companyId, paymentMethod: 'Cash', paymentStatus: 'PAID', grandTotal: 1000, createdAt: testDate, deleted: false, isMarkit: false, invoiceNumber: 'TEST-1' }),
    })
    await assertRows(client, 'BILL', billId, [{ accountType: 'CASH', direction: 'CREDIT', amount: 1000 }])

    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'BILL',
      sourceId: billId,
      rows: billLedgerRows({
        id: billId,
        companyId,
        paymentMethod: 'Split',
        paymentStatus: 'PAID',
        splitPayments: [{ method: 'Cash', amount: 400 }, { method: 'UPI', amount: 600 }],
        grandTotal: 1000,
        createdAt: testDate,
        deleted: false,
        isMarkit: false,
        invoiceNumber: 'TEST-1',
      }),
    })
    await assertRows(client, 'BILL', billId, [
      { accountType: 'CASH', direction: 'CREDIT', amount: 400 },
      { accountType: 'PRIMARY_BANK', direction: 'CREDIT', amount: 600 },
    ])
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'BILL', sourceId: billId })
    await assertNoRows(client, 'BILL', billId)
    console.log('OK bill create/edit/delete updates ledger')

    const expenseId = `${runId}:expense`
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'EXPENSE',
      sourceId: expenseId,
      rows: expenseLedgerRows({ id: expenseId, companyId, totalAmount: 250, paymentMode: 'BANK', status: 'PAID', expenseDate: testDate, note: runId }),
    })
    await assertRows(client, 'EXPENSE', expenseId, [{ accountType: 'PRIMARY_BANK', direction: 'DEBIT', amount: 250 }])
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'EXPENSE',
      sourceId: expenseId,
      rows: expenseLedgerRows({ id: expenseId, companyId, totalAmount: 125, paymentMode: 'CASH', status: 'PAID', expenseDate: testDate, note: runId }),
    })
    await assertRows(client, 'EXPENSE', expenseId, [{ accountType: 'CASH', direction: 'DEBIT', amount: 125 }])
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'EXPENSE', sourceId: expenseId })
    await assertNoRows(client, 'EXPENSE', expenseId)
    console.log('OK expense create/edit/delete updates ledger')

    const distributorPaymentId = `${runId}:distributor-payment`
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'DISTRIBUTOR_PAYMENT',
      sourceId: distributorPaymentId,
      rows: distributorPaymentLedgerRows({ id: distributorPaymentId, companyId, amount: 333, paymentType: 'CASH', createdAt: testDate, remarks: runId }),
    })
    await assertRows(client, 'DISTRIBUTOR_PAYMENT', distributorPaymentId, [{ accountType: 'CASH', direction: 'DEBIT', amount: 333 }])
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'DISTRIBUTOR_PAYMENT',
      sourceId: distributorPaymentId,
      rows: distributorPaymentLedgerRows({ id: distributorPaymentId, companyId, amount: 444, paymentType: 'BANK', createdAt: testDate, remarks: runId }),
    })
    await assertRows(client, 'DISTRIBUTOR_PAYMENT', distributorPaymentId, [{ accountType: 'PRIMARY_BANK', direction: 'DEBIT', amount: 444 }])
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'DISTRIBUTOR_PAYMENT', sourceId: distributorPaymentId })
    await assertNoRows(client, 'DISTRIBUTOR_PAYMENT', distributorPaymentId)
    console.log('OK distributor payment create/edit/delete updates ledger')

    const moneyId = `${runId}:money-transaction`
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'MONEY_TRANSACTION',
      sourceId: moneyId,
      rows: moneyTransactionLedgerRows({ id: moneyId, companyId, amount: 700, paymentMode: 'CASH', direction: 'RECEIVED', status: 'PAID', createdAt: testDate, note: runId }),
    })
    await assertRows(client, 'MONEY_TRANSACTION', moneyId, [{ accountType: 'CASH', direction: 'CREDIT', amount: 700 }])
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'MONEY_TRANSACTION',
      sourceId: moneyId,
      rows: moneyTransactionLedgerRows({ id: moneyId, companyId, amount: 300, paymentMode: 'BANK', accountId: bankId || null, direction: 'GIVEN', status: 'PAID', createdAt: testDate, note: runId }),
    })
    await assertRows(client, 'MONEY_TRANSACTION', moneyId, [{ accountType: bankId ? 'BANK' : 'PRIMARY_BANK', accountId: bankId || null, direction: 'DEBIT', amount: 300 }])
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'MONEY_TRANSACTION', sourceId: moneyId })
    await assertNoRows(client, 'MONEY_TRANSACTION', moneyId)
    console.log('OK money transaction create/edit/delete updates ledger')

    const transferId = `${runId}:transfer`
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'ACCOUNT_TRANSFER',
      sourceId: transferId,
      rows: transferLedgerRows({ id: transferId, companyId, fromType: 'CASH', toType: 'BANK', amount: 800, createdAt: testDate, note: runId }),
    })
    await assertRows(client, 'ACCOUNT_TRANSFER', transferId, [
      { accountType: 'CASH', direction: 'DEBIT', amount: 800 },
      { accountType: 'PRIMARY_BANK', direction: 'CREDIT', amount: 800 },
    ])
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'ACCOUNT_TRANSFER',
      sourceId: transferId,
      rows: transferLedgerRows({ id: transferId, companyId, fromType: 'BANK', fromAccountId: bankId || null, toType: 'INVESTMENT', amount: 500, createdAt: testDate, note: runId }),
    })
    await assertRows(client, 'ACCOUNT_TRANSFER', transferId, [
      { accountType: bankId ? 'BANK' : 'PRIMARY_BANK', accountId: bankId || null, direction: 'DEBIT', amount: 500 },
      { accountType: 'INVESTMENT', direction: 'CREDIT', amount: 500 },
    ])
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'ACCOUNT_TRANSFER', sourceId: transferId })
    await assertNoRows(client, 'ACCOUNT_TRANSFER', transferId)
    console.log('OK transfer create/edit/delete updates ledger')

    const investmentId = `${runId}:investment`
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'INVESTMENT',
      sourceId: investmentId,
      rows: investmentLedgerRows({ id: investmentId, companyId, amount: 900, direction: 'IN', status: 'COMPLETED', createdAt: testDate, note: runId }),
    })
    await assertRows(client, 'INVESTMENT', investmentId, [{ accountType: 'INVESTMENT', direction: 'CREDIT', amount: 900 }])
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'INVESTMENT',
      sourceId: investmentId,
      rows: investmentLedgerRows({ id: investmentId, companyId, amount: 450, direction: 'OUT', status: 'COMPLETED', createdAt: testDate, note: runId }),
    })
    await assertRows(client, 'INVESTMENT', investmentId, [{ accountType: 'INVESTMENT', direction: 'DEBIT', amount: 450 }])
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'INVESTMENT', sourceId: investmentId })
    await assertNoRows(client, 'INVESTMENT', investmentId)
    console.log('OK investment create/edit/delete updates ledger')

    await assertRunningBalance(client)
    console.log('OK running balances recalculate during writeflow')

    await client.query('ROLLBACK')
    console.log('Rolled back test transaction; no test rows were kept.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

main()
  .then(async () => {
    await pool.end()
    console.log('\nAccount ledger writeflow test passed.')
  })
  .catch(async (error) => {
    await pool.end()
    console.error(`\nAccount ledger writeflow test failed: ${error.message}`)
    process.exit(1)
  })
