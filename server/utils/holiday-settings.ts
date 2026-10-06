import { createError } from 'h3'

export function assertHolidayManager(role: string) {
    if (!['admin', 'manager', 'accountant'].includes(role)) {
        throw createError({ statusCode: 403, statusMessage: 'Holiday management access required' })
    }
}

export function holidayYear(value: unknown): number {
    const year = typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : value
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
        throw createError({ statusCode: 400, statusMessage: 'Year must be between 2000 and 2100' })
    }
    return year
}

export function validateHoliday(body: unknown) {
    const input = body as { date?: unknown; name?: unknown } | null
    if (typeof input?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw createError({ statusCode: 400, statusMessage: 'Choose a valid holiday date' })
    }
    const [year, month, day] = input.date.split('-').map(Number)
    holidayYear(year)
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        throw createError({ statusCode: 400, statusMessage: 'Choose a valid holiday date' })
    }
    if (input.name != null && (typeof input.name !== 'string' || input.name.trim().length > 120)) {
        throw createError({ statusCode: 400, statusMessage: 'Holiday name must be 120 characters or fewer' })
    }
    return { date, name: typeof input.name === 'string' ? input.name.trim() || null : null }
}
