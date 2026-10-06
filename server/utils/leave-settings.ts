import { z } from 'zod'
import { createError } from 'h3'
import { attendanceDay } from './attendance-write'
export function validateLeave(body: unknown) {
    const parsed = z.object({
        userId: z.string().min(1), type: z.enum(['CASUAL', 'SICK', 'EARNED', 'OTHER', 'COMP_OFF']),
        customType: z.string().trim().max(100).nullish(), startDate: z.string(), endDate: z.string(),
        days: z.coerce.number().positive().multipleOf(0.5), reason: z.string().trim().min(1).max(2000),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).default('PENDING'),
        decisionNote: z.string().trim().max(1000).nullish(),
    }).safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
    const input = parsed.data
    const startDate = attendanceDay(input.startDate), endDate = attendanceDay(input.endDate)
    if (endDate < startDate || input.days > Math.round((+endDate - +startDate) / 86400000) + 1)
        throw createError({ statusCode: 400, statusMessage: 'Leave days must fit the selected date range' })
    return { ...input, startDate, endDate, customType: input.type === 'OTHER' ? input.customType || null : null }
}
