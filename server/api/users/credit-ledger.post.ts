import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { ensureAccountLedgerSchema, moneyTransactionLedgerRows, rebuildAccountLedgerForSource, userCreditAccountLedgerRows } from '~/server/utils/account-ledger'
import { upsertUserLedgerEntry, type UserLedgerDirection, type UserLedgerEntryType, type UserLedgerSourceType } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody<{
    userId?: string
    type?: 'CREDIT' | 'PAYMENT' | UserLedgerEntryType
    direction?: UserLedgerDirection
    sourceType?: UserLedgerSourceType
    sourceId?: string | null
    amount?: number
    note?: string | null
    paymentMode?: 'CASH' | 'BANK' | 'UPI'
    transactionDate?: string | null
    createdAt?: string | null
  }>(event)

  const amount = Number(body.amount || 0)
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'User is required' })
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Amount must be positive' })

  const type: UserLedgerEntryType =
    body.type === 'PAYMENT'
      ? 'CREDIT_BILL_PAYMENT'
      : body.type === 'CREDIT'
        ? 'USER_CREDIT_BILL'
        : (body.type as UserLedgerEntryType) || 'USER_CREDIT_BILL'
  const direction: UserLedgerDirection =
    body.direction || (type === 'CREDIT_BILL_PAYMENT' ? 'CREDIT' : 'DEBIT')
  const when = body.createdAt || body.transactionDate ? new Date((body.createdAt || body.transactionDate) as string) : new Date()
  const paymentMode = body.paymentMode === 'BANK' || body.paymentMode === 'UPI' ? 'BANK' : 'CASH'
  const moneyDirection = type === 'CREDIT_BILL_PAYMENT' ? 'RECEIVED' : 'GIVEN'

  const client = await pool.connect()
  try {
    await ensureAccountLedgerSchema(client)
    await client.query('BEGIN')

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
      sourceType: body.sourceType || 'MANUAL',
      sourceId: body.sourceId || null,
      amount,
      note: body.note || null,
      createdAt: when,
    })

    if (row?.id && (body.sourceType || 'MANUAL') === 'MANUAL') {
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
      await rebuildAccountLedgerForSource(client, {
        companyId,
        sourceType: 'MONEY_TRANSACTION',
        sourceId: row.id,
        rows: moneyTransactionLedgerRows({
          id: row.id,
          companyId,
          amount,
          paymentMode,
          accountId: null,
          direction: moneyDirection,
          status: 'PAID',
          createdAt: when,
          note: body.note || (type === 'CREDIT_BILL_PAYMENT' ? 'User credit received' : 'User credit given'),
        }),
      })
    }

    if (row?.id) {
      await rebuildAccountLedgerForSource(client, {
        companyId,
        sourceType: 'USER_CREDIT',
        sourceId: row.id,
        rows: userCreditAccountLedgerRows({
          id: row.id,
          companyId,
          type,
          sourceType: body.sourceType || 'MANUAL',
          sourceId: body.sourceId || null,
          amount,
          createdAt: when,
          note: body.note || (type === 'CREDIT_BILL_PAYMENT' ? 'User credit received' : 'User credit given'),
        }),
      })
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
