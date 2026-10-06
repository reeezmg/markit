import { assertCreditManager, validateUserCredit } from '~/server/utils/user-credit-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

import { recalculateManyUserLedgerBalances } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  assertCreditManager(session.data.role)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ledger id is required' })

  const body = validateUserCredit(await readBody(event))
  const { amount, type, direction, paymentMode, moneyDirection } = body
  let when = body.when

  const client = await pool.connect()
  try {

    await client.query('BEGIN')
    await lockCompanyRequest(event, client)

    const existingRes = await client.query(
      `
      SELECT user_id, created_at
      FROM user_ledger_entries
      WHERE id = $1
        AND company_id = $2
        AND source_type = 'MANUAL'
        AND type IN ('USER_CREDIT_BILL', 'CREDIT_BILL_PAYMENT')
      FOR UPDATE
      `,
      [id, companyId],
    )
    if (!existingRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'Manual credit row not found' })
    const oldUserId = existingRes.rows[0].user_id
    if (body.userId !== oldUserId) throw createError({ statusCode: 400, statusMessage: 'Staff member cannot be changed on an existing credit entry' })
    const originalDate = new Date(existingRes.rows[0].created_at)
    if (originalDate.toISOString().slice(0, 10) === when.toISOString().slice(0, 10)) when = originalDate

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

    await client.query(
      `
      UPDATE user_ledger_entries
      SET user_id = $3,
          type = $4::"UserLedgerEntryType",
          direction = $5::"UserLedgerDirection",
          amount = $6,
          note = $7,
          created_at = $8,
          updated_at = now()
      WHERE id = $1
        AND company_id = $2
      `,
      [id, companyId, body.userId, type, direction, amount, body.note || null, when],
    )

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
        id,
        companyId,
        moneyDirection,
        amount,
        paymentMode,
        body.note || (type === 'CREDIT_BILL_PAYMENT' ? 'User credit received' : 'User credit given'),
        when,
      ],
    )



    await recalculateManyUserLedgerBalances(client, companyId, [oldUserId, body.userId])
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
