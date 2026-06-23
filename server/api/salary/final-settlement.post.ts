import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { insertSalaryPaymentInClient } from './_payment'
import { ensureAccountLedgerSchema, moneyTransactionLedgerRows, rebuildAccountLedgerForSource, userCreditAccountLedgerRows } from '~/server/utils/account-ledger'
import { upsertUserLedgerEntry } from '~/server/utils/user-ledger'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<{
        userId?: string
        amount?: number | null
        paymentMode?: 'CASH' | 'BANK' | 'UPI'
        bankAccountId?: string | null
        settlementDate?: string | null
        note?: string | null
    }>(event)

    if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'User is required' })

    const requestedAmount = body.amount === null || body.amount === undefined ? null : Number(body.amount)
    if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount < 0)) {
        throw createError({ statusCode: 400, statusMessage: 'Amount must be zero or positive' })
    }

    const when = body.settlementDate ? new Date(body.settlementDate) : new Date()
    const client = await pool.connect()

    try {
        await ensureAccountLedgerSchema(client)
        await client.query('BEGIN')

        const userRes = await client.query(
            `
            SELECT company_id, user_id, name, status, deleted, opening_balance
            FROM company_users
            WHERE company_id = $1
              AND user_id = $2
              AND deleted = false
            LIMIT 1
            FOR UPDATE
            `,
            [companyId, body.userId],
        )
        const user = userRes.rows[0]
        if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
        if (!user.status) throw createError({ statusCode: 400, statusMessage: 'User is already inactive' })

        const latestRes = await client.query(
            `
            SELECT balance_after
            FROM user_ledger_entries
            WHERE company_id = $1
              AND user_id = $2
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            `,
            [companyId, body.userId],
        )
        const currentDue = round2(Number(latestRes.rows[0]?.balance_after ?? user.opening_balance ?? 0))
        const settlementAmount = round2(requestedAmount === null ? Math.abs(currentDue) : requestedAmount)
        if (Math.abs(settlementAmount - Math.abs(currentDue)) > 0.009) {
            throw createError({ statusCode: 400, statusMessage: 'Settlement amount must match the current due' })
        }
        const note = body.note || `Full and final settlement - ${user.name || body.userId}`
        let settlementType: 'SALARY_PAYMENT' | 'CREDIT_BILL_PAYMENT' | 'NONE' = 'NONE'
        let settlementId: string | null = null

        if (currentDue > 0.009) {
            if (settlementAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Settlement amount must be positive' })
            if (settlementAmount > Math.abs(currentDue) + 0.009) {
                throw createError({ statusCode: 400, statusMessage: 'Settlement amount cannot exceed current due' })
            }
            const result = await insertSalaryPaymentInClient(client, companyId, {
                userId: body.userId,
                amount: settlementAmount,
                type: 'SALARY',
                paymentMode: body.paymentMode || 'CASH',
                bankAccountId: body.bankAccountId || null,
                paymentDate: when.toISOString(),
                note,
            })
            settlementType = 'SALARY_PAYMENT'
            settlementId = result.paymentId
        } else if (currentDue < -0.009) {
            if (settlementAmount <= 0) throw createError({ statusCode: 400, statusMessage: 'Settlement amount must be positive' })
            if (settlementAmount > Math.abs(currentDue) + 0.009) {
                throw createError({ statusCode: 400, statusMessage: 'Settlement amount cannot exceed current due' })
            }
            const ledgerRow = await upsertUserLedgerEntry(client, {
                companyId,
                userId: body.userId,
                type: 'CREDIT_BILL_PAYMENT',
                direction: 'CREDIT',
                sourceType: 'MANUAL',
                sourceId: crypto.randomUUID(),
                amount: settlementAmount,
                note,
                createdAt: when,
            })
            const moneyId = ledgerRow?.id || crypto.randomUUID()
            const paymentMode = body.paymentMode === 'BANK' || body.paymentMode === 'UPI' ? 'BANK' : 'CASH'
            const accountId = paymentMode === 'BANK' ? body.bankAccountId || null : null

            await client.query(
                `
                INSERT INTO money_transactions
                  (id, company_id, party_type, direction, status, amount, payment_mode, account_id, note, created_at, updated_at)
                VALUES
                  ($1, $2, 'EMPLOYEE', 'RECEIVED', 'PAID', $3, $4, $5, $6, $7, now())
                `,
                [moneyId, companyId, settlementAmount, paymentMode, accountId, note, when],
            )
            await rebuildAccountLedgerForSource(client, {
                companyId,
                sourceType: 'MONEY_TRANSACTION',
                sourceId: moneyId,
                rows: moneyTransactionLedgerRows({
                    id: moneyId,
                    companyId,
                    amount: settlementAmount,
                    paymentMode,
                    accountId,
                    direction: 'RECEIVED',
                    status: 'PAID',
                    createdAt: when,
                    note,
                }),
            })
            await rebuildAccountLedgerForSource(client, {
                companyId,
                sourceType: 'USER_CREDIT',
                sourceId: moneyId,
                rows: userCreditAccountLedgerRows({
                    id: moneyId,
                    companyId,
                    type: 'CREDIT_BILL_PAYMENT',
                    sourceType: 'MANUAL',
                    sourceId: ledgerRow?.id || null,
                    amount: settlementAmount,
                    createdAt: when,
                    note,
                }),
            })
            settlementType = 'CREDIT_BILL_PAYMENT'
            settlementId = moneyId
        }

        await client.query(
            `
            UPDATE company_users
            SET status = false
            WHERE company_id = $1
              AND user_id = $2
            `,
            [companyId, body.userId],
        )

        await client.query('COMMIT')
        return {
            success: true,
            userId: body.userId,
            previousDue: currentDue,
            settledAmount: settlementAmount,
            settlementType,
            settlementId,
            deactivated: true,
        }
    } catch (err) {
        await client.query('ROLLBACK')
        throw err
    } finally {
        client.release()
    }
})
