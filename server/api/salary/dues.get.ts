import { defineEventHandler, createError } from 'h3'
import { prisma } from '~/server/prisma'

/**
 * Per-user salary dues for the company.
 * Source of truth: user_ledger_entries.balance_after.
 * Positive = owed to the user; negative = user owes the company.
 */

const num = (v: any) => Number(v ?? 0)

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const users = await prisma.companyUser.findMany({
        where: { companyId, deleted: false },
        select: { userId: true, name: true, openingBalance: true },
    })

    let ledgerRows: Array<{
        userId: string
        balance: any
        accrued: any
        paid: any
        creditDue: any
        opening: any
    }> = []

    try {
        ledgerRows = await prisma.$queryRaw<Array<{
            userId: string
            balance: any
            accrued: any
            paid: any
            creditDue: any
            opening: any
        }>>`
            WITH latest AS (
                SELECT DISTINCT ON (user_id)
                    user_id,
                    balance_after
                FROM user_ledger_entries
                WHERE company_id = ${companyId}
                ORDER BY user_id, created_at DESC, id DESC
            ),
            totals AS (
                SELECT
                    user_id,
                    SUM(CASE WHEN type = 'PAYROLL_ACCRUAL' THEN amount ELSE 0 END) AS accrued,
                    SUM(CASE WHEN type = 'SALARY_PAYMENT' THEN amount ELSE 0 END) AS paid,
                    SUM(
                        CASE
                            WHEN type = 'USER_CREDIT_BILL' THEN amount
                            WHEN type = 'CREDIT_BILL_PAYMENT' THEN -amount
                            ELSE 0
                        END
                    ) AS credit_due,
                    SUM(CASE WHEN type = 'OPENING' THEN CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END ELSE 0 END) AS opening
                FROM user_ledger_entries
                WHERE company_id = ${companyId}
                GROUP BY user_id
            )
            SELECT
                totals.user_id AS "userId",
                COALESCE(latest.balance_after, 0) AS balance,
                COALESCE(totals.accrued, 0) AS accrued,
                COALESCE(totals.paid, 0) AS paid,
                COALESCE(totals.credit_due, 0) AS "creditDue",
                COALESCE(totals.opening, 0) AS opening
            FROM totals
            LEFT JOIN latest ON latest.user_id = totals.user_id
        `
    } catch (error: any) {
        if (error?.code !== '42P01') throw error
    }

    const ledgerBy = new Map(ledgerRows.map((row) => [row.userId, row]))
    const rows = users.map((u) => {
        const ledger = ledgerBy.get(u.userId)
        const opening = ledger ? num(ledger.opening) : num(u.openingBalance)
        const acc = num(ledger?.accrued)
        const paid = num(ledger?.paid)
        const credit = num(ledger?.creditDue)
        const due = ledger ? num(ledger.balance) : opening
        return {
            userId: u.userId,
            name: u.name,
            openingBalance: round2(opening),
            accrued: round2(acc),
            paid: round2(paid),
            creditBills: round2(credit),
            creditDue: round2(credit),
            due: round2(due),
        }
    })

    return { dues: rows }
})

function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100
}
