// server/utils/attendance-import.ts
// Pure parsing helpers for biometric Excel exports. Used by server/api/attendance/import.post.ts.

export interface ImportPunch {
    type: 'CHECK_IN' | 'CHECK_OUT'
    punchedAt: string // ISO-ish "YYYY-MM-DDTHH:mm:00"
}

export interface ImportRecord {
    code: number
    dateKey: string // 'YYYY-MM-DD'
    inAt: string | null
    outAt: string | null
    punches?: ImportPunch[]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseDMY(value: any): { y: number; m: number; d: number } | null {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(value ?? '').trim())
    if (!m) return null
    return { d: +m[1], m: +m[2], y: +m[3] }
}

function dateKeyFromDMY(value: { y: number; m: number; d: number }) {
    return `${value.y}-${pad(value.m)}-${pad(value.d)}`
}

export function parseTime(dateKey: string, value: any): string | null {
    const s = String(value ?? '').trim()
    if (!s || s.includes('--')) return null

    const m = /^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m?\.?)?$/i.exec(s)
    if (!m) return null

    let hh = Number(m[1])
    const mm = Number(m[2])
    const meridiem = m[3]?.toLowerCase()
    if (meridiem === 'p' && hh < 12) hh += 12
    if (meridiem === 'a' && hh === 12) hh = 0
    if (hh > 23 || mm > 59) return null

    return `${dateKey}T${pad(hh)}:${m[2]}:00`
}

export function parseCode(value: any): number | null {
    const digits = String(value ?? '').trim().replace(/\D/g, '')
    if (!digits) return null
    const n = parseInt(digits, 10)
    return Number.isFinite(n) ? n : null
}

export function extractFirstDateKey(rows: any[][]): string | null {
    for (const row of rows) {
        for (let i = 0; i < row.length; i++) {
            const cell = String(row?.[i] ?? '').trim()
            if (!/\bdate\b/i.test(cell)) continue
            for (let j = i; j < Math.min(row.length, i + 6); j++) {
                const dmy = parseDMY(row?.[j])
                if (dmy) return dateKeyFromDMY(dmy)
            }
        }
    }
    return null
}

function punchTypeFromHeader(value: any): ImportPunch['type'] | null {
    const header = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
    if (header === 'intime' || /^in\d+$/.test(header)) return 'CHECK_IN'
    if (header === 'outtime' || /^out\d+$/.test(header)) return 'CHECK_OUT'
    return null
}

function makeRecord(input: { code: number; dateKey: string; inAt: string | null; outAt: string | null; punches: ImportPunch[] }): ImportRecord {
    const record: ImportRecord = {
        code: input.code,
        dateKey: input.dateKey,
        inAt: input.inAt,
        outAt: input.outAt,
    }
    Object.defineProperty(record, 'punches', {
        value: input.punches,
        enumerable: false,
        configurable: true,
    })
    return record
}

/**
 * Daily layout:
 * - First "Date" label in the sheet provides the attendance date.
 * - Header row starts with Empcode and contains INTime, Out1, In2, Out2, ... OUTTime.
 * - Empcode values like 0001 and 1 both normalize to numeric code 1.
 */
export function extractDaily(rows: any[][], dateKey?: string): ImportRecord[] {
    const out: ImportRecord[] = []
    const resolvedDateKey = dateKey || extractFirstDateKey(rows)
    if (!resolvedDateKey) return out

    const headerIdx = rows.findIndex((r) => String(r?.[0] ?? '').trim().toLowerCase() === 'empcode')
    if (headerIdx < 0) return out

    const header = rows[headerIdx]
    const punchColumns = header
        .map((value, index) => ({ index, type: punchTypeFromHeader(value) }))
        .filter((column): column is { index: number; type: ImportPunch['type'] } => Boolean(column.type))

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i]
        const code = parseCode(row?.[0])
        if (code == null) continue

        const punches = punchColumns
            .map((column) => {
                const punchedAt = parseTime(resolvedDateKey, row?.[column.index])
                return punchedAt ? { type: column.type, punchedAt } : null
            })
            .filter((punch): punch is ImportPunch => Boolean(punch))

        if (!punches.length) continue
        const inAt = punches.find((punch) => punch.type === 'CHECK_IN')?.punchedAt || null
        const outAt = [...punches].reverse().find((punch) => punch.type === 'CHECK_OUT')?.punchedAt || null
        out.push(makeRecord({ code, dateKey: resolvedDateKey, inAt, outAt, punches }))
    }

    return out
}

/** Monthly layout: repeating blocks; "Empcode" marker row, then Date(0)|Shift(1)|IN(2)|...|Out(17). */
export function extractMonthly(rows: any[][], month: number, year: number): ImportRecord[] {
    const out: ImportRecord[] = []
    let currentCode: number | null = null

    for (const row of rows) {
        const first = String(row?.[0] ?? '').trim()
        if (first.toLowerCase() === 'empcode') {
            currentCode = parseCode(row?.[1])
            continue
        }

        const dmy = parseDMY(first)
        if (!dmy || currentCode == null) continue
        if (dmy.m !== Number(month) || dmy.y !== Number(year)) continue

        const dateKey = dateKeyFromDMY(dmy)
        const inAt = parseTime(dateKey, row?.[2])
        const outAt = parseTime(dateKey, row?.[17])
        if (!inAt && !outAt) continue

        const punches: ImportPunch[] = []
        if (inAt) punches.push({ type: 'CHECK_IN', punchedAt: inAt })
        if (outAt) punches.push({ type: 'CHECK_OUT', punchedAt: outAt })
        out.push(makeRecord({ code: currentCode, dateKey, inAt, outAt, punches }))
    }

    return out
}
