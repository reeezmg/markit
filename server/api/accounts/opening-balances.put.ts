import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { rebuildAccountLedgerForSource, type AccountLedgerRowInput } from '~/server/utils/account-ledger'

const openingRow = (
  companyId: string,
  accountType: 'CASH' | 'PRIMARY_BANK',
  amount: number,
  entryDate: Date | null,
  note: string,
): AccountLedgerRowInput[] => {
  if (!amount || !entryDate) return []
  return [{
    companyId,
    accountType,
    accountId: null,
    direction: amount > 0 ? 'CREDIT' : 'DEBIT',
    amount: Math.abs(amount),
    sourceType: 'OPENING',
    sourceId: `${companyId}:${accountType}`,
    entryDate,
    note,
  }]
}

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const cash = Number(body.cash || 0)
  const bank = Number(body.bank || 0)
  const openingCashDate = body.openingCashDate ? new Date(body.openingCashDate) : null
  const openingBankDate = body.openingBankDate ? new Date(body.openingBankDate) : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      UPDATE companies
      SET cash = $2,
          bank = $3,
          opening_cash_date = $4,
          opening_bank_date = $5
      WHERE id = $1
      `,
      [companyId, cash, bank, openingCashDate, openingBankDate],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'OPENING',
      sourceId: `${companyId}:CASH`,
      rows: openingRow(companyId, 'CASH', cash, openingCashDate, 'Cash opening balance'),
    })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'OPENING',
      sourceId: `${companyId}:PRIMARY_BANK`,
      rows: openingRow(companyId, 'PRIMARY_BANK', bank, openingBankDate, 'Primary bank opening balance'),
    })
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
