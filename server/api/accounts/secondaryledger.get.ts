import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { accountLedgerRowsForApi } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const bankId = query.bankId as string
  if (!bankId) throw createError({ statusCode: 400, statusMessage: 'Bank ID required' })
  const from = query.from ? new Date(query.from as string) : new Date('1970-01-01')
  const to = query.to ? new Date(query.to as string) : new Date()
  const client = await pool.connect()

  try {
    const bankRes = await client.query(
      `
      SELECT id, bank_name, acc_holder_name, account_no, ifsc, upi_id
      FROM bank_accounts
      WHERE id = $1 AND company_id = $2
      `,
      [bankId, companyId],
    )
    const b = bankRes.rows[0]
    if (!b) throw createError({ statusCode: 404, statusMessage: 'Bank not found' })
    const result = await accountLedgerRowsForApi(client, { companyId, accountType: 'BANK', accountId: bankId, from, to })
    return {
      bank: {
        id: b.id,
        type: 'SECONDARY',
        bankName: b.bank_name,
        accHolderName: b.acc_holder_name,
        accountNo: b.account_no,
        ifsc: b.ifsc,
        upiId: b.upi_id,
        openingBalance: result.openingBalance,
      },
      from,
      to,
      ledger: result.ledger,
      closingBalance: result.closingBalance,
    }
  } finally {
    client.release()
  }
})
