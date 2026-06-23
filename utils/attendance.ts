// utils/attendance.ts
// Pure, framework-agnostic helpers for attendance roster + monthly view.
// Ported from the contractor app (AttendancePage.vue / AttendanceViewPage.vue)
// and adapted to markit's ZenStack data shapes.

export type PunchType = 'CHECK_IN' | 'CHECK_OUT'

export interface PunchLog {
    id?: string
    type: PunchType
    punchedAt: string | Date
    note?: string | null
}

export interface ShiftLike {
    startTime: string // "HH:mm"
    endTime: string // "HH:mm"
}

// A single user's attendance for one calendar day.
export interface AttendanceEntry {
    /** Anchor date "YYYY-MM-DD" used to resolve shift boundaries. */
    date: string
    logs: PunchLog[]
    shift?: ShiftLike | null
}

export type SegmentState = 'in' | 'out' | 'future'

export interface AttendanceSegment {
    key: string
    state: SegmentState
    width: number
    title: string
}

// ─── Date / time formatting ───────────────────────────────────

export function dateKey(date: Date | string): string {
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatPunchTime(value?: string | Date | null): string {
    if (!value) return ''
    return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function timeHHMM(value?: string | Date | null): string {
    if (!value) return ''
    return new Date(value).toTimeString().slice(0, 5)
}

export function formatHours(hours: number): string {
    return `${hours.toFixed(2)}h`
}

/** Bare numeric hours for grid cells/totals (empty string when zero). */
export function formatHoursBare(hours: number): string {
    return hours > 0 ? hours.toFixed(2) : ''
}

export function hoursBetween(start?: string | Date | null, end?: string | Date | null): number {
    if (!start || !end) return 0
    return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 36e5)
}

// ─── Shift boundaries ─────────────────────────────────────────

function parseShiftBoundary(dateStr: string, time: string, addDay = false): Date {
    const [hours = '0', minutes = '0'] = time.split(':')
    const date = new Date(`${dateStr}T00:00:00`)
    date.setHours(Number(hours), Number(minutes), 0, 0)
    if (addDay) date.setDate(date.getDate() + 1)
    return date
}

/** Resolves the active window for a day: shift bounds, or padded punch span as fallback. */
export function shiftWindow(entry: AttendanceEntry): { start: Date; end: Date } | null {
    const logTimes = [...(entry.logs ?? [])]
        .map((log) => new Date(log.punchedAt))
        .sort((a, b) => a.getTime() - b.getTime())

    let start = entry.shift ? parseShiftBoundary(entry.date, entry.shift.startTime) : null
    let end = entry.shift ? parseShiftBoundary(entry.date, entry.shift.endTime) : null

    if (!start || !end) {
        if (!logTimes.length) return null
        start = new Date(logTimes[0])
        start.setMinutes(start.getMinutes() - 5, 0, 0)
        end = new Date(logTimes[logTimes.length - 1])
        end.setMinutes(end.getMinutes() + 5, 0, 0)
    }

    if (end <= start) {
        end = entry.shift
            ? parseShiftBoundary(entry.date, entry.shift.endTime, true)
            : new Date(start.getTime() + 10 * 60 * 1000)
    }

    const lastLogAt = [...(entry.logs ?? [])]
        .map((log) => new Date(log.punchedAt))
        .filter((date) => date >= start!)
        .sort((a, b) => b.getTime() - a.getTime())[0]
    if (lastLogAt && lastLogAt >= end) {
        end = new Date(lastLogAt.getTime() + 5 * 60 * 1000)
    }
    return { start, end }
}

export function shiftHours(entry: AttendanceEntry): number {
    const window = shiftWindow(entry)
    if (!window) return 0
    return Math.max(0, (window.end.getTime() - window.start.getTime()) / 36e5)
}

// ─── Punch analysis ───────────────────────────────────────────

function sortedLogs(logs: PunchLog[]): PunchLog[] {
    return [...(logs ?? [])].sort(
        (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
    )
}

export function firstPunch(logs: PunchLog[], type: PunchType): PunchLog | null {
    return sortedLogs(logs).find((log) => log.type === type) ?? null
}

export function lastPunch(logs: PunchLog[], type: PunchType): PunchLog | null {
    return [...sortedLogs(logs)].reverse().find((log) => log.type === type) ?? null
}

export function latestPunchType(logs: PunchLog[]): PunchType | null {
    return [...(logs ?? [])].sort(
        (a, b) => new Date(b.punchedAt).getTime() - new Date(a.punchedAt).getTime(),
    )[0]?.type ?? null
}

export function punchPairs(logs: PunchLog[]): { in?: PunchLog; out?: PunchLog }[] {
    const pairs: { in?: PunchLog; out?: PunchLog }[] = []
    let current: { in?: PunchLog; out?: PunchLog } | null = null

    for (const log of sortedLogs(logs)) {
        if (log.type === 'CHECK_IN') {
            if (current?.in && !current.out) pairs.push(current)
            current = { in: log }
        } else if (current?.in && !current.out) {
            current.out = log
            pairs.push(current)
            current = null
        }
    }
    if (current?.in) pairs.push(current)
    return pairs
}

// ─── Per-day metrics ──────────────────────────────────────────

export function workingHours(entry: AttendanceEntry): number {
    return punchPairs(entry.logs).reduce(
        (sum, pair) => sum + hoursBetween(pair.in?.punchedAt, pair.out?.punchedAt),
        0,
    )
}

export function breakHours(entry: AttendanceEntry): number {
    const pairs = punchPairs(entry.logs)
    let total = 0
    for (let i = 0; i < pairs.length - 1; i += 1) {
        total += hoursBetween(pairs[i].out?.punchedAt, pairs[i + 1].in?.punchedAt)
    }
    return total
}

export function lateHours(entry: AttendanceEntry): number {
    const checkIn = firstPunch(entry.logs, 'CHECK_IN')
    const window = shiftWindow(entry)
    if (!checkIn || !window) return 0
    return Math.max(0, (new Date(checkIn.punchedAt).getTime() - window.start.getTime()) / 36e5)
}

export function earlyExitHours(entry: AttendanceEntry): number {
    const checkOut = lastPunch(entry.logs, 'CHECK_OUT')
    const window = shiftWindow(entry)
    if (!checkOut || !window) return 0
    return Math.max(0, (window.end.getTime() - new Date(checkOut.punchedAt).getTime()) / 36e5)
}

export function overtimeHours(entry: AttendanceEntry): number {
    return Math.max(0, workingHours(entry) - shiftHours(entry))
}

export function attendanceMetrics(entry: AttendanceEntry) {
    const checkIn = firstPunch(entry.logs, 'CHECK_IN')
    return {
        checkIn: checkIn ? formatPunchTime(checkIn.punchedAt) : '',
        late: formatHours(lateHours(entry)),
        work: formatHours(workingHours(entry)),
        break: formatHours(breakHours(entry)),
        overtime: formatHours(overtimeHours(entry)),
    }
}

// ─── Timeline segments (roster bar) ───────────────────────────

function segmentLabel(state: SegmentState): string {
    if (state === 'in') return 'In'
    if (state === 'future') return 'Future'
    return 'Out'
}

export function segmentClass(state: SegmentState): string {
    if (state === 'in') return 'bg-green-500'
    if (state === 'future') return 'bg-gray-300 dark:bg-gray-600'
    return 'bg-red-400/70'
}

function segmentTitle(state: SegmentState, start: Date, end: Date): string {
    return `${segmentLabel(state)} ${formatPunchTime(start)} - ${formatPunchTime(end)}`
}

export function attendanceSegments(entry: AttendanceEntry, todayKey?: string): AttendanceSegment[] {
    const window = shiftWindow(entry)
    if (!window) return []

    const totalMs = window.end.getTime() - window.start.getTime()
    if (totalMs <= 0) return []

    const logs = [...(entry.logs ?? [])]
        .map((log) => ({ ...log, at: new Date(log.punchedAt) }))
        .filter((log) => log.at < window.end)
        .sort((a, b) => a.at.getTime() - b.at.getTime())

    const segments: AttendanceSegment[] = []
    let cursor = window.start
    let state: SegmentState = 'out'
    const now = new Date()
    const futureFrom = entry.date === (todayKey ?? dateKey(now)) ? now : null

    for (const log of logs) {
        if (log.at < window.start) {
            state = log.type === 'CHECK_IN' ? 'in' : 'out'
            continue
        }
        if (log.at > cursor) {
            segments.push({
                key: `${segments.length}-${state}`,
                state,
                width: ((log.at.getTime() - cursor.getTime()) / totalMs) * 100,
                title: segmentTitle(state, cursor, log.at),
            })
        }
        state = log.type === 'CHECK_IN' ? 'in' : 'out'
        cursor = log.at
    }

    if (cursor < window.end) {
        segments.push({
            key: `${segments.length}-${state}`,
            state,
            width: ((window.end.getTime() - cursor.getTime()) / totalMs) * 100,
            title: segmentTitle(state, cursor, window.end),
        })
    }

    if (futureFrom && futureFrom > window.start && futureFrom < window.end) {
        const elapsedPct = ((futureFrom.getTime() - window.start.getTime()) / totalMs) * 100
        let usedPct = 0
        const split: AttendanceSegment[] = []
        for (const segment of segments) {
            const startPct = usedPct
            const endPct = usedPct + segment.width
            usedPct = endPct
            if (endPct <= elapsedPct) {
                split.push(segment)
            } else if (startPct >= elapsedPct) {
                split.push({ ...segment, state: 'future', title: segmentTitle('future', futureFrom, window.end) })
            } else {
                split.push({ ...segment, width: elapsedPct - startPct })
                split.push({
                    key: `${segment.key}-future`,
                    state: 'future',
                    width: endPct - elapsedPct,
                    title: segmentTitle('future', futureFrom, window.end),
                })
            }
        }
        return split.filter((segment) => segment.width > 0)
    }

    return segments.filter((segment) => segment.width > 0)
}
