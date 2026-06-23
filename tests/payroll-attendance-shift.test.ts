/**
 * Unit tests for Attendance, Shift and Salary/Payroll pure logic.
 *
 *   npx tsx tests/payroll-attendance-shift.test.ts      (or: npm test)
 *
 * Tests the REAL source modules (no copies):
 *   - utils/attendance.ts                    (roster/monthly math)
 *   - server/utils/payroll.ts                (shift hours, worked hours, cycle line, dues)
 *   - server/utils/attendance-import.ts      (Excel parsers)
 * Plus end-to-end extraction against the two real biometric .xls files (if present).
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
const XLSX = createRequire(import.meta.url)('xlsx') // CJS interop for reading .xls

import {
    dateKey,
    hoursBetween,
    formatHours,
    formatHoursBare,
    timeHHMM,
    punchPairs,
    firstPunch,
    lastPunch,
    latestPunchType,
    workingHours as attWorkingHours,
    breakHours as attBreakHours,
    lateHours as attLateHours,
    earlyExitHours as attEarlyExitHours,
    overtimeHours as attOvertimeHours,
    attendanceMetrics,
    shiftHours as attShiftHours,
    type AttendanceEntry,
} from '../utils/attendance'

import {
    shiftHoursOf,
    workedHoursOf,
    computeUserLine,
    computeDue,
    round2,
    type DayInput,
    type SalaryCfgLike,
} from '../server/utils/payroll'

import {
    parseCode,
    parseDMY,
    parseTime,
    extractDaily,
    extractMonthly,
} from '../server/utils/attendance-import'

// ─── tiny test harness ───
let passed = 0
let failed = 0
const failures: string[] = []
function section(t: string) { console.log(`\n\x1b[1m${t}\x1b[0m`) }
function test(name: string, fn: () => void) {
    try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`) }
    catch (e: any) { failed++; failures.push(`${name} :: ${e.message}`); console.log(`  \x1b[31m✗ ${name}\x1b[0m — ${e.message}`) }
}
function eq(a: any, b: any, msg = '') {
    const A = JSON.stringify(a), B = JSON.stringify(b)
    if (A !== B) throw new Error(`${msg} expected ${B} got ${A}`)
}
function approx(a: number, b: number, eps = 0.01, msg = '') {
    if (Math.abs(a - b) > eps) throw new Error(`${msg} expected ~${b} got ${a}`)
}
function ok(c: boolean, msg = 'expected truthy') { if (!c) throw new Error(msg) }

const pad = (n: number) => String(n).padStart(2, '0')
const D = '2026-06-01'
const at = (hhmm: string) => `${D}T${hhmm}:00`

// ════════════════════════════════════════════════════════════
section('SHIFT — shiftHoursOf')
// ════════════════════════════════════════════════════════════
test('normal day shift 09:00–17:00 = 8h', () => approx(shiftHoursOf({ startTime: '09:00', endTime: '17:00' }), 8))
test('with 60-min break = 7h', () => approx(shiftHoursOf({ startTime: '09:00', endTime: '17:00', breakMinutes: 60 }), 7))
test('overnight 22:00–06:00 = 8h', () => approx(shiftHoursOf({ startTime: '22:00', endTime: '06:00' }), 8))
test('half-hour shift 09:00–09:30 = 0.5h', () => approx(shiftHoursOf({ startTime: '09:00', endTime: '09:30' }), 0.5))
test('null shift = 0', () => approx(shiftHoursOf(null), 0))
test('empty strings = 0', () => approx(shiftHoursOf({ startTime: '', endTime: '' }), 0))
test('equal start/end treated as 24h', () => approx(shiftHoursOf({ startTime: '09:00', endTime: '09:00' }), 24))

// ════════════════════════════════════════════════════════════
section('SHIFT/ATTENDANCE — workedHoursOf')
// ════════════════════════════════════════════════════════════
const ci = (t: string) => ({ type: 'CHECK_IN', punchedAt: at(t) })
const co = (t: string) => ({ type: 'CHECK_OUT', punchedAt: at(t) })
test('single pair 09:00–17:00 = 8h', () => approx(workedHoursOf([ci('09:00'), co('17:00')]), 8))
test('two pairs excludes the break = 7h', () => approx(workedHoursOf([ci('09:00'), co('12:00'), ci('13:00'), co('17:00')]), 7))
test('unordered logs are sorted = 8h', () => approx(workedHoursOf([co('17:00'), ci('09:00')]), 8))
test('unpaired check-in only = 0h', () => approx(workedHoursOf([ci('09:00')]), 0))
test('no logs but check-in/out fallback = 8h', () => approx(workedHoursOf([], at('09:00'), at('17:00')), 8))
test('no logs and no fallback = 0h', () => approx(workedHoursOf([]), 0))
test('double check-in then one out counts first pair', () => approx(workedHoursOf([ci('09:00'), ci('10:00'), co('17:00')]), 8))

// ════════════════════════════════════════════════════════════
section('ATTENDANCE — utils/attendance.ts helpers')
// ════════════════════════════════════════════════════════════
test('dateKey formats Y-M-D', () => eq(dateKey(new Date('2026-06-09T10:00:00')), '2026-06-09'))
test('hoursBetween 09:00→17:00 = 8', () => approx(hoursBetween(at('09:00'), at('17:00')), 8))
test('hoursBetween null = 0', () => approx(hoursBetween(null, at('17:00')), 0))
test('formatHours 1.5 = "1.50h"', () => eq(formatHours(1.5), '1.50h'))
test('formatHoursBare 0 = ""', () => eq(formatHoursBare(0), ''))
test('formatHoursBare 2 = "2.00"', () => eq(formatHoursBare(2), '2.00'))
test('timeHHMM extracts HH:mm', () => eq(timeHHMM(at('09:21')), '09:21'))
test('punchPairs pairs in/out', () => eq(punchPairs([ci('09:00'), co('17:00')]).length, 1))
test('punchPairs two pairs', () => eq(punchPairs([ci('09:00'), co('12:00'), ci('13:00'), co('17:00')]).length, 2))
test('firstPunch CHECK_IN', () => eq(firstPunch([ci('09:00'), co('17:00')], 'CHECK_IN')!.punchedAt, at('09:00')))
test('lastPunch CHECK_OUT', () => eq(lastPunch([co('12:00'), co('17:00')], 'CHECK_OUT')!.punchedAt, at('17:00')))
test('latestPunchType returns last', () => eq(latestPunchType([ci('09:00'), co('17:00')]), 'CHECK_OUT'))

const entry = (logs: any[], shift: any = { startTime: '09:00', endTime: '17:00' }): AttendanceEntry => ({ date: D, shift, logs })
test('attShiftHours = 8', () => approx(attShiftHours(entry([])), 8))
test('workingHours single pair = 8', () => approx(attWorkingHours(entry([ci('09:00'), co('17:00')])), 8))
test('breakHours between two pairs = 1', () => approx(attBreakHours(entry([ci('09:00'), co('12:00'), ci('13:00'), co('17:00')])), 1))
test('lateHours check-in 09:30 = 0.5', () => approx(attLateHours(entry([ci('09:30'), co('17:00')])), 0.5))
test('lateHours on-time = 0', () => approx(attLateHours(entry([ci('09:00'), co('17:00')])), 0))
test('earlyExitHours leave 16:00 = 1', () => approx(attEarlyExitHours(entry([ci('09:00'), co('16:00')])), 1))
test('overtimeHours worked 9h vs 8h = 1', () => approx(attOvertimeHours(entry([ci('09:00'), co('18:00')])), 1))
test('attendanceMetrics formats fields', () => {
    const m = attendanceMetrics(entry([ci('09:30'), co('18:00')]))
    eq(m.checkIn, '09:30'); eq(m.late, '0.50h'); eq(m.work, '8.50h'); eq(m.overtime, '0.50h')
})

// ════════════════════════════════════════════════════════════
section('SALARY — computeUserLine')
// ════════════════════════════════════════════════════════════
const SHIFT = {
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    overtimeMode: 'NONE' as const,
    overtimeRate: 0,
    otDailyThresholdMinutes: 0,
    otHourlyRoundMinutes: 0,
    leaveCutFullDay: 1000,
    leaveCutHalfDay: 500,
    leaveCutPerHour: 100,
} // 8h
const baseCfg: SalaryCfgLike = {
    period: 'MONTHLY', amount: 30000,
}
const P = (inT: string, outT: string, status: any = 'PRESENT'): DayInput => ({
    shift: SHIFT, status, logs: [ci(inT), co(outT)], checkInAt: null, checkOutAt: null,
})
const ABSENT: DayInput = { shift: SHIFT, status: 'ABSENT', logs: [] }
const NOREC: DayInput = { shift: SHIFT, status: null, logs: [] }
const run = (cfg: SalaryCfgLike, days: DayInput[], adjustmentTotal = 0, totalDays = cfg.period === 'MONTHLY' ? 30 : days.length) =>
    computeUserLine(cfg, days, { totalDays, monthlyDays: 30, adjustmentTotal })

test('MONTHLY, one full present day → net = full salary', () => {
    const r = run(baseCfg, [P('09:00', '17:00')])
    eq([r.presentDays, r.absentDays, r.leaveDeduction, r.netPay], [1, 0, 0, 30000])
})
test('absent day → full-day cut', () => {
    const r = run(baseCfg, [ABSENT])
    eq([r.absentDays, r.leaveDeduction, r.netPay], [1, 1000, 29000])
})
test('no attendance row (null) → treated absent', () => {
    const r = run(baseCfg, [NOREC])
    eq([r.absentDays, r.leaveDeduction, r.netPay], [1, 1000, 29000])
})
test('LEAVE status → full-day cut (unpaid)', () => {
    const r = run(baseCfg, [{ shift: SHIFT, status: 'LEAVE', logs: [] }])
    eq([r.absentDays, r.leaveDeduction, r.netPay], [1, 1000, 29000])
})
test('HALF_DAY no punch → half-day cut', () => {
    const r = run(baseCfg, [{ shift: SHIFT, status: 'HALF_DAY', logs: [] }])
    eq([r.halfDays, r.presentDays, r.leaveDeduction, r.netPay], [1, 0, 400, 29600])
})
test('HALF_DAY with punch → half-day cut, no per-hour cut', () => {
    const r = run(baseCfg, [{ shift: SHIFT, status: 'HALF_DAY', logs: [ci('09:00'), co('13:00')] }])
    eq([r.halfDays, r.leaveDeduction, r.netPay], [1, 400, 29600])
})
test('HALF_DAY without per-hour cut falls back to configured half-day cut', () => {
    const r = run(baseCfg, [{ shift: { ...SHIFT, leaveCutPerHour: 0 }, status: 'HALF_DAY', logs: [] }])
    eq([r.halfDays, r.leaveDeduction, r.netPay], [1, 500, 29500])
})
test('present but short hours → per-hour cut (6h worked, 2h short ×100)', () => {
    const r = run(baseCfg, [P('09:00', '15:00')])
    eq([r.leaveDeduction, r.netPay], [200, 29800])
})

section('SALARY — overtime modes')
test('paid leave allowance makes absent days paid present days', () => {
    const shift = { ...SHIFT, paidLeaveDays: 1 }
    const r = run(baseCfg, [
        { shift, status: 'ABSENT', logs: [] },
        { shift, status: 'ABSENT', logs: [] },
    ])
    eq([r.presentDays, r.absentDays, r.leaveDeduction, r.netPay], [1, 1, 1000, 29000])
})
test('paid holiday without attendance is paid as present', () => {
    const r = run(baseCfg, [{ shift: { ...SHIFT, holidayPaid: true }, status: null, logs: [], isHoliday: true }])
    eq([r.presentDays, r.absentDays, r.leaveDeduction, r.netPay], [1, 0, 0, 30000])
})
test('unpaid holiday without attendance receives normal absence cut', () => {
    const r = run(baseCfg, [{ shift: { ...SHIFT, holidayPaid: false }, status: null, logs: [], isHoliday: true }])
    eq([r.presentDays, r.absentDays, r.leaveDeduction, r.netPay], [0, 1, 1000, 29000])
})
test('late entry after grace applies configured fine', () => {
    const r = run(baseCfg, [{ ...P('09:11', '17:00'), shift: { ...SHIFT, lateEntryGraceMinutes: 10, lateEntryFine: 50 } }])
    eq([r.lateEntryFine, r.netPay], [50, 29931.67])
})
test('late entry within grace has no fine', () => {
    const r = run(baseCfg, [{ ...P('09:10', '17:00'), shift: { ...SHIFT, lateEntryGraceMinutes: 10, lateEntryFine: 50 } }])
    eq([r.lateEntryFine, r.netPay], [0, 29983.33])
})
test('early exit before grace applies configured fine', () => {
    const r = run(baseCfg, [{ ...P('09:00', '16:49'), shift: { ...SHIFT, earlyExitGraceMinutes: 10, earlyExitFine: 75 } }])
    eq([r.earlyExitFine, r.netPay], [75, 29906.67])
})
test('early exit within grace has no fine', () => {
    const r = run(baseCfg, [{ ...P('09:00', '16:50'), shift: { ...SHIFT, earlyExitGraceMinutes: 10, earlyExitFine: 75 } }])
    eq([r.earlyExitFine, r.netPay], [0, 29983.33])
})

const hourlyShift = { ...SHIFT, overtimeMode: 'HOURLY' as const, overtimeRate: 100, otHourlyRoundMinutes: 30 }
test('HOURLY OT 1h40m, round-up ≥30m → 2h ×100 = 200', () => {
    const r = run(baseCfg, [{ ...P('09:00', '18:40'), shift: hourlyShift }])
    eq([r.overtimeHours, r.overtimeAmount, r.netPay], [2, 200, 30200])
})
test('HOURLY OT 1h20m, remainder <30m → floor 1h = 100', () => {
    const r = run(baseCfg, [{ ...P('09:00', '18:20'), shift: hourlyShift }])
    eq([r.overtimeHours, r.overtimeAmount, r.netPay], [1, 100, 30100])
})
test('HOURLY round=0 → never rounds up (1h40m → 1h)', () => {
    const r = run(baseCfg, [{ ...P('09:00', '18:40'), shift: { ...hourlyShift, otHourlyRoundMinutes: 0 } }])
    eq([r.overtimeHours, r.overtimeAmount], [1, 100])
})
const dailyShift = { ...SHIFT, overtimeMode: 'DAILY' as const, overtimeRate: 500, otDailyThresholdMinutes: 30 }
test('DAILY OT 40m ≥ threshold → flat 500', () => {
    const r = run(baseCfg, [{ ...P('09:00', '17:40'), shift: dailyShift }])
    eq([r.overtimeAmount, r.netPay], [500, 30500])
})
test('DAILY OT 20m < threshold → 0', () => {
    const r = run(baseCfg, [{ ...P('09:00', '17:20'), shift: dailyShift }])
    eq([r.overtimeAmount, r.netPay], [0, 30000])
})
test('NONE mode → no OT even if worked > shift', () => {
    const r = run(baseCfg, [P('09:00', '19:00')])
    eq([r.overtimeAmount, r.netPay], [0, 30000])
})

section('SALARY — period types')
test('WEEKLY salary prorates by totalDays/7', () => {
    const cfg: SalaryCfgLike = { ...baseCfg, period: 'WEEKLY', amount: 7000 }
    const days = Array.from({ length: 7 }, () => P('09:00', '17:00'))
    const r = run(cfg, days, 0, 7)
    eq([r.baseSalary, r.netPay], [7000, 7000])
})
test('WEEKLY with one absent → base unchanged, cut applied', () => {
    const cfg: SalaryCfgLike = { ...baseCfg, period: 'WEEKLY', amount: 7000 }
    const days = [...Array.from({ length: 6 }, () => P('09:00', '17:00')), ABSENT]
    const r = run(cfg, days, 0, 7)
    eq([r.baseSalary, r.leaveDeduction, r.netPay], [7000, 1000, 6000])
})
test('WEEKLY extra day prorates as weekly/7', () => {
    const cfg: SalaryCfgLike = { ...baseCfg, period: 'WEEKLY', amount: 7000 }
    const r = run(cfg, Array.from({ length: 8 }, () => P('09:00', '17:00')), 0, 8)
    eq([r.baseSalary, r.netPay], [8000, 8000])
})
test('MONTHLY custom period prorates by month days', () => {
    const r = computeUserLine(baseCfg, [P('09:00', '17:00')], { totalDays: 15, monthlyDays: 30, adjustmentTotal: 0 })
    eq([r.baseSalary, r.netPay], [15000, 15000])
})
test('MONTHLY period crossing months prorates each month separately', () => {
    const r = computeUserLine(baseCfg, [P('09:00', '17:00')], {
        totalDays: 27,
        monthlySegments: [
            { days: 17, daysInMonth: 31 },
            { days: 10, daysInMonth: 28 },
        ],
        adjustmentTotal: 0,
    })
    eq([r.baseSalary, r.netPay], [27165.9, 27165.9])
})
test('DAILY salary = amount × expected days, absent cut removes a day', () => {
    const cfg: SalaryCfgLike = { ...baseCfg, period: 'DAILY', amount: 1000 }
    const r = run(cfg, [P('09:00', '17:00'), P('09:00', '17:00'), ABSENT])
    eq([r.expectedDays, r.baseSalary, r.leaveDeduction, r.netPay], [3, 3000, 1000, 2000])
})
test('HOURLY salary = amount x expected shift hours', () => {
    const cfg: SalaryCfgLike = { ...baseCfg, period: 'HOURLY', amount: 125 }
    const r = run(cfg, [P('09:00', '17:00'), P('09:00', '17:00')])
    eq([r.expectedDays, r.baseSalary, r.netPay], [2, 2000, 2000])
})

section('SALARY — adjustments & combined')
test('adjustment addition increases net', () => eq(run(baseCfg, [P('09:00', '17:00')], 500).netPay, 30500))
test('adjustment deduction decreases net', () => eq(run(baseCfg, [P('09:00', '17:00')], -300).netPay, 29700))
test('commission percentage adds to gross and net pay', () => {
    const r = computeUserLine(
        { ...baseCfg, commissionPercentage: 2.5 },
        [P('09:00', '17:00')],
        { totalDays: 30, monthlyDays: 30, adjustmentTotal: 0, commissionSales: 10000 },
    )
    eq([r.commissionSales, r.commissionAmount, r.grossPay, r.netPay], [10000, 250, 30250, 30250])
})
test('combined: OT + absent + short + nothing → 29000', () => {
    const r = run(baseCfg, [{ ...P('09:00', '18:40'), shift: hourlyShift }, ABSENT, P('09:00', '15:00')])
    // OT day: +200 ; absent: -1000 ; short 2h: -200  → 30000 -1200 +200
    eq([r.overtimeAmount, r.leaveDeduction, r.netPay], [200, 1200, 29000])
})

// ════════════════════════════════════════════════════════════
section('SALARY — computeDue (opening + accrued − paid)')
// ════════════════════════════════════════════════════════════
test('pending salary', () => eq(computeDue(0, 30000, 10000), 20000))
test('only opening balance owed', () => eq(computeDue(1000, 0, 0), 1000))
test('overpaid → negative due', () => eq(computeDue(0, 5000, 8000), -3000))
test('negative opening can zero out', () => eq(computeDue(-500, 5000, 4500), 0))
test('round2 trims float drift', () => eq(round2(0.1 + 0.2), 0.3))

// ════════════════════════════════════════════════════════════
section('IMPORT — parsers')
// ════════════════════════════════════════════════════════════
test('parseCode "0001" → 1', () => eq(parseCode('0001'), 1))
test('parseCode "25" → 25', () => eq(parseCode('25'), 25))
test('parseCode "  7 " → 7', () => eq(parseCode('  7 '), 7))
test('parseCode "" → null', () => eq(parseCode(''), null))
test('parseCode "abc" → null', () => eq(parseCode('abc'), null))
test('parseDMY "01/06/2026"', () => eq(parseDMY('01/06/2026'), { d: 1, m: 6, y: 2026 }))
test('parseDMY invalid → null', () => eq(parseDMY('2026-06-01'), null))
test('parseTime "09:21"', () => eq(parseTime('2026-06-14', '09:21'), '2026-06-14T09:21:00'))
test('parseTime "--:--" → null', () => eq(parseTime('2026-06-14', '--:--'), null))
test('parseTime "" → null', () => eq(parseTime('2026-06-14', ''), null))
test('parseTime "25:00" (bad hour) → null', () => eq(parseTime('2026-06-14', '25:00'), null))

section('IMPORT — extract from crafted rows')
test('extractDaily reads INTime(3)/OUTTime(18)', () => {
    const rows = [
        ['Daily IN/OUT Report'],
        ['Empcode', 'Name', 'Shift', 'INTime', 'Out1', '', '', '', '', '', '', '', '', '', '', '', '', '', 'OUTTime'],
        ['0002', 'Card', '1', '09:21', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '17:40'],
        ['0003', 'X', 'X', '--:--', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '--:--'],
    ]
    const recs = extractDaily(rows, '2026-06-14')
    eq(recs.length, 1)
    eq(recs[0], { code: 2, dateKey: '2026-06-14', inAt: '2026-06-14T09:21:00', outAt: '2026-06-14T17:40:00' })
})
test('extractMonthly walks per-employee blocks, filters month/year', () => {
    const block = (code: string, rowsForUser: any[][]) => [
        ['Empcode', code, '', '', '', '', '', 'Name', '', 'N'],
        ['Date', 'Shift', 'IN'],
        ...rowsForUser,
    ]
    const rows = [
        ...block('0001', [['12/06/2026', '1', '14:21', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '--:--']]),
        ...block('25', [['13/06/2026', '1', '16:46', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '17:06']]),
        ...block('9', [['05/05/2026', '1', '09:00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '17:00']]), // wrong month
    ]
    const recs = extractMonthly(rows, 6, 2026)
    eq(recs.length, 2)
    eq(recs[0], { code: 1, dateKey: '2026-06-12', inAt: '2026-06-12T14:21:00', outAt: null })
    eq(recs[1], { code: 25, dateKey: '2026-06-13', inAt: '2026-06-13T16:46:00', outAt: '2026-06-13T17:06:00' })
})

// ════════════════════════════════════════════════════════════
section('IMPORT — real biometric .xls files (if present)')
// ════════════════════════════════════════════════════════════
const DAILY_XLS = 'C:/Users/User/Downloads/DAILYINOUT14062026135025 (1).xls'
const MONTHLY_XLS = 'C:/Users/User/Downloads/monthinout14062026163612.xls'
function sheetRows(path: string): any[][] {
    const wb = XLSX.readFile(path)
    return XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
}
if (fs.existsSync(DAILY_XLS)) {
    test('real daily file → 1 punch (code 2 in 09:21)', () => {
        const recs = extractDaily(sheetRows(DAILY_XLS), '2026-06-14')
        eq(recs.length, 1)
        eq(recs[0].code, 2); eq(recs[0].inAt, '2026-06-14T09:21:00'); eq(recs[0].outAt, null)
    })
} else { console.log('  \x1b[33m∼ skipped real daily file (not found)\x1b[0m') }
if (fs.existsSync(MONTHLY_XLS)) {
    test('real monthly file → 5 staff with punches', () => {
        const recs = extractMonthly(sheetRows(MONTHLY_XLS), 6, 2026)
        eq(recs.length, 5)
        const codes = recs.map((r) => r.code).sort((a, b) => a - b)
        eq(codes, [1, 2, 4, 25, 95])
        const c25 = recs.find((r) => r.code === 25)!
        ok(!!c25.inAt && !!c25.outAt, 'code 25 should have both in and out')
    })
} else { console.log('  \x1b[33m∼ skipped real monthly file (not found)\x1b[0m') }

// ─── summary ───
console.log(`\n${'─'.repeat(48)}`)
console.log(`\x1b[1mTotal: ${passed + failed}  \x1b[32mpassed: ${passed}\x1b[0m  ${failed ? `\x1b[31mfailed: ${failed}\x1b[0m` : 'failed: 0'}`)
if (failed) {
    console.log('\n\x1b[31mFailures:\x1b[0m')
    for (const f of failures) console.log('  • ' + f)
    process.exit(1)
}
console.log('\x1b[32mAll tests passed.\x1b[0m')


