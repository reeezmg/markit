import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { bankOpeningRow, rebuildAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Bank id is required' })
  const body = await readBody<any>(event)
  const openingBalance = Number(body.openingBalance || 0)
  const openingBalanceDate = body.openingBalanceDate || body.openingBankDate ? new Date(body.openingBalanceDate || body.openingBankDate) : new Date()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(
      `
      UPDATE bank_accounts
      SET acc_holder_name = $3,
          bank_name = $4,
          account_no = $5,
          ifsc = $6,
          gstin = $7,
          upi_id = $8,
          opening_balance = $9,
          opening_balance_date = $10,
          "updatedAt" = now()
      WHERE id = $1 AND company_id = $2
      RETURNING id, "createdAt"
      `,
      [id, companyId, body.accHolderName || null, body.bankName || null, body.accountNo || null, body.ifsc || null, body.gstin || null, body.upiId || null, openingBalance, openingBalanceDate],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Bank not found' })
    await rebuildAccountLedgerForSource(client, {
      companyId,
      sourceType: 'OPENING',
      sourceId: id,
      rows: bankOpeningRow({ companyId, bankId: id, openingBalance, openingBalanceDate, createdAt: res.rows[0].createdAt, bankName: body.bankName }),
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
