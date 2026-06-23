import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { rebuildAccountLedgerForSource, type AccountLedgerRowInput } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const bank = Number(body.openingBalance ?? body.bank ?? 0)
  const openingBankDate = body.openingBankDate ? new Date(body.openingBankDate) : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      UPDATE companies
      SET acc_holder_name = $2,
          bank_name = $3,
          account_no = $4,
          ifsc = $5,
          gstin = $6,
          upi_id = $7,
          bank = $8,
          opening_bank_date = $9
      WHERE id = $1
      `,
      [companyId, body.accHolderName || null, body.bankName || null, body.accountNo || null, body.ifsc || null, body.gstin || null, body.upiId || null, bank, openingBankDate],
    )
    const rows: AccountLedgerRowInput[] = bank && openingBankDate ? [{
      companyId,
      accountType: 'PRIMARY_BANK',
      accountId: null,
      direction: bank > 0 ? 'CREDIT' : 'DEBIT',
      amount: Math.abs(bank),
      sourceType: 'OPENING',
      sourceId: `${companyId}:PRIMARY_BANK`,
      entryDate: openingBankDate,
      note: 'Primary bank opening balance',
    }] : []
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'OPENING',
      sourceId: `${companyId}:PRIMARY_BANK`,
      rows,
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
