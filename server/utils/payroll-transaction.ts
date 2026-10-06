import type { Prisma } from '@prisma/client'
/** Existing SQL ledger helpers must use the same connection as payroll model writes. */
export function payrollSql(tx: Prisma.TransactionClient) {
    return { async query(sql: string, values: any[] = []) {
        if (/^\s*SELECT\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
            const rows = await tx.$queryRawUnsafe<any[]>(sql, ...values)
            return { rows, rowCount: rows.length }
        }
        const rowCount = await tx.$executeRawUnsafe(sql, ...values)
        return { rows: [] as any[], rowCount }
    } }
}
