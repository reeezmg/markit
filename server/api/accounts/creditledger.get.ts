import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { accountLedgerRowsForApi } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const from = query.from ? new Date(query.from as string) : new Date('1970-01-01')
  const to = query.to ? new Date(query.to as string) : new Date()
  const client = await pool.connect()

  try {
    const result = await accountLedgerRowsForApi(client, { companyId, accountType: 'CREDIT', accountId: null, from, to })
    return {
      account: { id: 'CREDIT', type: 'CREDIT', name: 'Credit', openingBalance: result.openingBalance },
      from,
      to,
      ledger: result.ledger,
      closingBalance: result.closingBalance,
    }
  } finally {
    client.release()
  }
})
