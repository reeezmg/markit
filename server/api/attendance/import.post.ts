import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { createRequire } from 'node:module'
import { extractDaily, extractFirstDateKey, extractMonthly, type ImportRecord } from '~/server/utils/attendance-import'

/**
 * Bulk-import attendance from a biometric machine Excel export (.xls/.xlsx).
 *
 * Two layouts are supported:
 *  - "daily"   : one row per employee for the first Date in the sheet.
 *                Columns: Empcode | Name | Shift | INTime | Out1 | In2 | ... | OUTTime | ...
 *  - "monthly" : repeating per-employee blocks, one row per date.
 *                "Empcode" marker row holds the code; each date row is
 *                Date(0) | Shift(1) | IN(2) | ... | Out(17) | ...
 *
 * Empcode is matched to CompanyUser.code (integer) within the company.
 * The shift is resolved from the active ShiftAssignment for the user/date.
 */

type ImportType = 'daily' | 'monthly'
const require = createRequire(import.meta.url)
const xlsxModuleName = 'xlsx'

interface ImportBody {
    file: string // base64-encoded workbook
    type: ImportType
    shiftId?: string | null // legacy/ignored; shift is resolved from assignment
    date?: string // legacy/optional; daily imports normally read the first Date from the sheet
    month?: number // 1-12 (monthly)
    year?: number // (monthly)
}

export default defineEventHandler(async (event) => {
    const session = await useAuthSession(event)
    const companyId = session.data?.companyId as string | undefined
    if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const body = await readBody<ImportBody>(event)
    if (!body?.file) throw createError({ statusCode: 400, statusMessage: 'file is required' })
    if (body.type !== 'daily' && body.type !== 'monthly') {
        throw createError({ statusCode: 400, statusMessage: 'type must be "daily" or "monthly"' })
    }

    // ─── Parse workbook ───
    let rows: any[][]
    try {
        const XLSX = require(xlsxModuleName)
        const buffer = Buffer.from(body.file, 'base64')
        const wb = XLSX.read(buffer, { type: 'buffer' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: '' })
    } catch (err: any) {
        throw createError({ statusCode: 422, statusMessage: `Could not read Excel file: ${err.message}` })
    }

    // ─── Extract records (parsing logic in server/utils/attendance-import.ts) ───
    let records: ImportRecord[] = []

    if (body.type === 'daily') {
        const dateKey = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
            ? body.date
            : extractFirstDateKey(rows)
        if (!dateKey) {
            throw createError({ statusCode: 400, statusMessage: 'Could not find Date in daily import file' })
        }
        records = extractDaily(rows, dateKey)
    } else {
        if (!body.month || !body.year) {
            throw createError({ statusCode: 400, statusMessage: 'month and year are required for monthly import' })
        }
        records = extractMonthly(rows, Number(body.month), Number(body.year))
    }

    if (!records.length) {
        return { imported: 0, overwritten: 0, skipped: 0, unmatchedCodes: [], matchedUsers: 0, totalRows: 0 }
    }

    // ─── Match Empcode → CompanyUser ───
    const staff = await prisma.companyUser.findMany({
        where: { companyId, deleted: false, code: { not: null } },
        select: { userId: true, code: true },
    })
    const codeToUser = new Map<number, string>()
    for (const s of staff) if (s.code != null) codeToUser.set(s.code, s.userId)

    let imported = 0
    let overwritten = 0
    let skipped = 0
    const unmatched = new Set<number>()
    const matchedUsers = new Set<string>()

    for (const rec of records) {
        const userId = codeToUser.get(rec.code)
        if (!userId) {
            unmatched.add(rec.code)
            skipped++
            continue
        }
        const dateObj = new Date(`${rec.dateKey}T00:00:00`)
        const inAt = rec.inAt ? new Date(rec.inAt) : null
        const outAt = rec.outAt ? new Date(rec.outAt) : null
        try {
            const result = await prisma.$transaction(async (tx) => {
                const shiftAssignment = await tx.shiftAssignment.findFirst({
                    where: {
                        companyId,
                        userId,
                        effectiveFrom: { lte: dateObj },
                        OR: [{ effectiveTo: null }, { effectiveTo: { gte: dateObj } }],
                    },
                    orderBy: { effectiveFrom: 'desc' },
                    select: { shiftId: true },
                })

                const existing = await tx.attendance.findUnique({
                    where: { companyId_userId_date: { companyId, userId, date: dateObj } },
                    select: { id: true },
                })

                if (existing) {
                    await tx.attendance.delete({
                        where: { id: existing.id },
                    })
                }

                const att = await tx.attendance.create({
                    data: {
                        companyId,
                        userId,
                        date: dateObj,
                        status: 'PRESENT',
                        shiftId: shiftAssignment?.shiftId || null,
                        checkInAt: inAt,
                        checkOutAt: outAt,
                    },
                })

                const logs = (rec.punches || [])
                    .map((punch) => ({
                        companyId,
                        userId,
                        attendanceId: att.id,
                        type: punch.type,
                        punchedAt: new Date(punch.punchedAt),
                        source: 'import',
                    }))
                if (logs.length) await tx.attendanceLog.createMany({ data: logs })

                return { overwritten: Boolean(existing) }
            })

            if (result.overwritten) overwritten++
            imported++
            matchedUsers.add(userId)
        } catch (err: any) {
            skipped++
        }
    }

    return {
        imported,
        overwritten,
        skipped,
        totalRows: records.length,
        matchedUsers: matchedUsers.size,
        unmatchedCodes: Array.from(unmatched).sort((a, b) => a - b),
    }
})
