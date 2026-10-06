import { createError } from 'h3'
export function assertSalaryManager(role: string) {
    if (!['admin', 'manager', 'accountant'].includes(role)) throw createError({ statusCode: 403, statusMessage: 'Salary management access required' })
}
export function salaryDate(value: unknown): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw createError({ statusCode: 400, statusMessage: 'A YYYY-MM-DD date is required' })
    const d = new Date(`${value}T00:00:00Z`)
    if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw createError({ statusCode: 400, statusMessage: 'Invalid salary date' })
    return d
}
export function salaryMoney(value: unknown, allowZero = false): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0) || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) throw createError({ statusCode: 400, statusMessage: 'Enter a valid amount with up to two decimals' })
    return Math.round(value * 100) / 100
}
export function publicSalaryPayment(input: any) {
    if (!input || typeof input.userId !== 'string' || !input.userId) throw createError({ statusCode: 400, statusMessage: 'Staff member is required' })
    if ('ledgerAmount' in input || 'cycleId' in input || 'cycleLineId' in input) throw createError({ statusCode: 400, statusMessage: 'Use the payroll settlement action for cycle-linked payments' })
    const amount = salaryMoney(input.amount)
    const type = input.type ?? 'SALARY', paymentMode = input.paymentMode ?? 'CASH'
    if (!['SALARY', 'ADVANCE'].includes(type) || !['CASH', 'BANK', 'UPI'].includes(paymentMode)) throw createError({ statusCode: 400, statusMessage: 'Invalid payment type or mode' })
    if (input.bankAccountId != null && typeof input.bankAccountId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Invalid bank account' })
    if (input.note != null && (typeof input.note !== 'string' || input.note.length > 1000)) throw createError({ statusCode: 400, statusMessage: 'Note must be 1000 characters or fewer' })
    return { userId: input.userId, amount, type, paymentMode, bankAccountId: input.bankAccountId || null,
        paymentDate: salaryDate(input.paymentDate ?? new Date().toISOString().slice(0, 10)).toISOString(), note: input.note?.trim() || null }
}
