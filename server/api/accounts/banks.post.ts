import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'
import { bankOpeningRow, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const body = await readBody<any>(event)
  const id = crypto.randomUUID()
  const openingBalance = Number(body.openingBalance || 0)
  const openingBalanceDate = body.openingBalanceDate || body.openingBankDate ? new Date(body.openingBalanceDate || body.openingBankDate) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO bank_accounts
        (id, company_id, acc_holder_name, bank_name, account_no, ifsc, gstin, upi_id, opening_balance, opening_balance_date, "createdAt", "updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
      `,
      [id, companyId, body.accHolderName || null, body.bankName || null, body.accountNo || null, body.ifsc || null, body.gstin || null, body.upiId || null, openingBalance, openingBalanceDate],
    )
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'OPENING',
      sourceId: id,
      rows: bankOpeningRow({ companyId, bankId: id, openingBalance, openingBalanceDate, bankName: body.bankName }),
    })
    await client.query('COMMIT')
    return { success: true, id }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
