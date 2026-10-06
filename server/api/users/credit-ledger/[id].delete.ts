import { assertCreditManager } from '~/server/utils/user-credit-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

import { recalculateUserLedgerBalances } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  assertCreditManager(session.data.role)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ledger id is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await lockCompanyRequest(event, client)
    const rowRes = await client.query(
      `
      DELETE FROM user_ledger_entries
      WHERE id = $1
        AND company_id = $2
        AND source_type = 'MANUAL'
        AND type IN ('USER_CREDIT_BILL', 'CREDIT_BILL_PAYMENT')
      RETURNING user_id
      `,
      [id, companyId],
    )
    if (!rowRes.rowCount) {
      throw createError({ statusCode: 404, statusMessage: 'Manual credit row not found' })
    }




    await client.query(
      `
      DELETE FROM money_transactions
      WHERE id = $1
        AND company_id = $2
        AND party_type = 'EMPLOYEE'
      `,
      [id, companyId],
    )

    await recalculateUserLedgerBalances(client, { companyId, userId: rowRes.rows[0].user_id })
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
