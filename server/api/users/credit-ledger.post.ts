import { assertCreditManager, validateUserCredit } from '~/server/utils/user-credit-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

import { upsertUserLedgerEntry } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  assertCreditManager(session.data.role)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = validateUserCredit(await readBody(event))
  const { amount, type, direction, paymentMode, moneyDirection } = body
  const when = body.when

  const client = await pool.connect()
  try {

    await client.query('BEGIN')
    await lockCompanyRequest(event, client)

    const userRes = await client.query(
      `
      SELECT 1
      FROM company_users
      WHERE company_id = $1
        AND user_id = $2
        AND deleted = false
      LIMIT 1
      `,
      [companyId, body.userId],
    )
    if (!userRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'User not found' })

    const row = await upsertUserLedgerEntry(client, {
      companyId,
      userId: body.userId,
      type,
      direction,
      sourceType: 'MANUAL',
      sourceId: null,
      amount,
      note: body.note || null,
      createdAt: when,
    })

    if (row?.id) {
      await client.query(
        `
        INSERT INTO money_transactions
          (id, company_id, party_type, direction, status, amount, payment_mode, account_id, note, created_at, updated_at)
        VALUES
          ($1, $2, 'EMPLOYEE', $3, 'PAID', $4, $5, NULL, $6, $7, now())
        ON CONFLICT (id)
        DO UPDATE SET
          direction = EXCLUDED.direction,
          amount = EXCLUDED.amount,
          payment_mode = EXCLUDED.payment_mode,
          note = EXCLUDED.note,
          created_at = EXCLUDED.created_at,
          updated_at = now()
        `,
        [
          row.id,
          companyId,
          moneyDirection,
          amount,
          paymentMode,
          body.note || (type === 'CREDIT_BILL_PAYMENT' ? 'User credit received' : 'User credit given'),
          when,
        ],
      )

    }



    await client.query('COMMIT')
    return { success: true, id: row?.id }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
