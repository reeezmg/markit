import { salaryMoney } from '~/server/utils/salary-input'
import crypto from 'crypto'
import { createError } from 'h3'
import { pool } from '~/server/db'

import { upsertUserLedgerEntry } from '~/server/utils/user-ledger'
import { selectStaffPaymentAccount } from '~/server/utils/staff-payment-account'

/**
 * Shared salary-payout writer (financial).
 * Records a SalaryPayment AND mirrors it as a money_transaction
 * (party EMPLOYEE, GIVEN, PAID) as linked payment-source history for native posting.
 * It never updates the archived ledger. type (SALARY|ADVANCE) is a label only.
 */

export interface PayInput {
    userId: string
    amount: number
    type?: 'SALARY' | 'ADVANCE'
    paymentMode?: 'CASH' | 'BANK' | 'UPI'
    bankAccountId?: string | null // Native BANK account; null = configured default.
    paymentDate?: string
    note?: string | null
    cycleId?: string | null
    cycleLineId?: string | null
    ledgerAmount?: number | null
}

const TRANSIENT = ['40001', '40P01', '53300', '57P01', '55006', '08006', '08003', 'P1001']

export async function insertSalaryPaymentInClient(
    client: any,
    companyId: string,
    p: PayInput,
): Promise<{ paymentId: string; moneyTransactionId: string }> {
    const amount = salaryMoney(Number(p.amount))
    if (!p.userId || !amount || amount <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'userId and a positive amount are required' })
    }
    const member = await client.query('SELECT user_id FROM company_users WHERE company_id=$1 AND user_id=$2 FOR SHARE', [companyId, p.userId])
    if (!member.rowCount) throw createError({ statusCode: 403, statusMessage: 'Staff member belongs to another company' })
    for (const [id, table] of [[p.cycleId, 'payroll_cycles'], [p.cycleLineId, 'payroll_cycle_lines']]) {
        if (!id) continue
        const record = await client.query(`SELECT id FROM ${table} WHERE id=$1 AND company_id=$2 FOR SHARE`, [id, companyId])
        if (!record.rowCount) throw createError({ statusCode: 403, statusMessage: 'Payment option belongs to another company' })
    }
    if (p.ledgerAmount != null) salaryMoney(Number(p.ledgerAmount))
    if (p.cycleLineId) {
        const linked = await client.query('SELECT id FROM payroll_cycle_lines WHERE id=$1 AND company_id=$2 AND user_id=$3 AND cycle_id=$4 FOR SHARE', [p.cycleLineId, companyId, p.userId, p.cycleId])
        if (!linked.rowCount) throw createError({ statusCode: 400, statusMessage: 'Payroll line does not match this staff member and cycle' })
    }
    const type = p.type ?? 'SALARY'
    const mode = p.paymentMode ?? 'CASH'
    const accountId = null // Archived bank identities are not assigned by new source writes.
    const ledgerMode = mode === 'UPI' ? 'BANK' : mode // UPI settles into bank for the ledger
    const when = p.paymentDate ? new Date(p.paymentDate) : new Date()
    const note = p.note || `Salary ${type.toLowerCase()}`
    const mtId = crypto.randomUUID()
    const payId = crypto.randomUUID()

    await client.query(
        `INSERT INTO money_transactions (id, company_id, party_type, direction, status, amount, payment_mode, account_id, note, created_at, updated_at)
         VALUES ($1, $2, 'EMPLOYEE', 'GIVEN', 'PAID', $3, $4, $5, $6, $7, now())`,
        [mtId, companyId, amount, ledgerMode, accountId, note, when],
    )

    await client.query(
        `INSERT INTO salary_payments
           (id, company_id, user_id, amount, type, payment_mode, bank_account_id, payment_date, note, cycle_id, cycle_line_id, money_transaction_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())`,
        [payId, companyId, p.userId, amount, type, mode, accountId, when, p.note || null, p.cycleId || null, p.cycleLineId || null, mtId],
    )

    const ledger = await upsertUserLedgerEntry(client, {
        companyId,
        userId: p.userId,
        type: 'SALARY_PAYMENT',
        direction: 'DEBIT',
        amount: Number(p.ledgerAmount || amount),
        sourceType: 'SALARY_PAYMENT',
        sourceId: payId,
        note: p.note || note,
        createdAt: when,
    })

    await selectStaffPaymentAccount(client, companyId, ledgerMode, p.bankAccountId, ledger.id)
    return { paymentId: payId, moneyTransactionId: mtId }
}

export async function recordPayment(
    companyId: string,
    p: PayInput,
): Promise<{ paymentId: string; moneyTransactionId: string }> {
    const amount = salaryMoney(Number(p.amount))
    if (!p.userId || !amount || amount <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'userId and a positive amount are required' })
    }

    async function attempt(n = 1): Promise<{ paymentId: string; moneyTransactionId: string }> {
        const client = await pool.connect()
        try {
            await client.query('BEGIN')
            await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
            const result = await insertSalaryPaymentInClient(client, companyId, p)
            await client.query('COMMIT')
            client.release()
            return result
        } catch (err: any) {
            await client.query('ROLLBACK')
            client.release()
            if (TRANSIENT.includes(err.code) && n < 3) {
                await new Promise((r) => setTimeout(r, 200 * 2 ** (n - 1)))
                return attempt(n + 1)
            }
            throw err
        }
    }
    return attempt()
}
