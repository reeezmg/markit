import { assertSalaryManager, publicSalaryPayment } from '~/server/utils/salary-input'
import { selectStaffPaymentAccount } from '~/server/utils/staff-payment-account'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import crypto from 'crypto'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { insertSalaryPaymentInClient } from './_payment'

import { upsertUserLedgerEntry } from '~/server/utils/user-ledger'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
    const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
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

    publicSalaryPayment({ userId: body.userId, amount: 1, paymentMode: body.paymentMode, bankAccountId: body.bankAccountId, paymentDate: body.settlementDate || undefined, note: body.note })
    const when = body.settlementDate ? new Date(body.settlementDate) : new Date()
    const client = await pool.connect()

    try {

        await client.query('BEGIN')
    await lockCompanyRequest(event, client)
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])

        const userRes = await client.query(
            `
            SELECT company_id, user_id, name, role, status, deleted, opening_balance
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

        if (user.role === 'admin') {
            const admins = await client.query("SELECT count(*) FROM company_users WHERE company_id=$1 AND role='admin' AND status=true AND deleted=false", [companyId])
            if (Number(admins.rows[0].count) <= 1) throw createError({ statusCode: 409, statusMessage: 'At least one active admin must remain in this company' })
        }
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
            const accountId = null

            await client.query(
                `
                INSERT INTO money_transactions
                  (id, company_id, party_type, direction, status, amount, payment_mode, account_id, note, created_at, updated_at)
                VALUES
                  ($1, $2, 'EMPLOYEE', 'RECEIVED', 'PAID', $3, $4, $5, $6, $7, now())
                `,
                [moneyId, companyId, settlementAmount, paymentMode, accountId, note, when],
            )


            await selectStaffPaymentAccount(client, companyId, paymentMode, body.bankAccountId, moneyId)
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
