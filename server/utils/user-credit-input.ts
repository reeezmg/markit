import { createError } from 'h3'

export function assertCreditManager(role: string) {
    if (!['admin', 'manager', 'accountant'].includes(role)) throw createError({ statusCode: 403, statusMessage: 'Staff credit management access required' })
}
export function validateUserCredit(input: unknown) {
    const body = input as Record<string, any> | null
    const invalid = (message: string): never => { throw createError({ statusCode: 400, statusMessage: message }) }
    if (!body || typeof body.userId !== 'string' || !body.userId.trim()) return invalid('Select a staff member')
    if (!['CREDIT', 'PAYMENT'].includes(body.type)) return invalid('Choose money given or repayment received')
    if (body.direction != null || body.sourceId != null || body.createdAt != null || (body.sourceType != null && body.sourceType !== 'MANUAL')) return invalid('Ledger direction and source are managed by the server')
    const amount = body.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 999999999 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) return invalid('Amount must be positive, at most 999999999, with no more than two decimal places')
    if (!['CASH', 'BANK'].includes(body.paymentMode)) return invalid('Choose cash or primary bank')
    if (typeof body.transactionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.transactionDate)) return invalid('Choose a valid transaction date')
    const when = new Date(`${body.transactionDate}T00:00:00.000Z`)
    if (!Number.isFinite(+when) || when.toISOString().slice(0, 10) !== body.transactionDate || when.getUTCFullYear() < 2000 || when.getUTCFullYear() > 2100) return invalid('Choose a valid date between 2000 and 2100')
    if (body.note != null && (typeof body.note !== 'string' || body.note.trim().length > 1000)) return invalid('Note must be 1000 characters or fewer')
    const type = body.type === 'PAYMENT' ? 'CREDIT_BILL_PAYMENT' as const : 'USER_CREDIT_BILL' as const
    return { userId: body.userId.trim(), amount: Math.round(amount * 100) / 100, note: body.note?.trim() || null,
        type, direction: type === 'CREDIT_BILL_PAYMENT' ? 'CREDIT' as const : 'DEBIT' as const,
        moneyDirection: type === 'CREDIT_BILL_PAYMENT' ? 'RECEIVED' as const : 'GIVEN' as const,
        paymentMode: body.paymentMode as 'CASH' | 'BANK', when }
}
