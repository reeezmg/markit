import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendSalaryRate, salaryRateOn, historicalSalaryTotals, minimumSalaryDate } from '../server/utils/salary-history'
import { publicSalaryPayment, assertSalaryManager } from '../server/utils/salary-input'
import { computeUserLine } from '../server/utils/payroll'

test('salary versions preserve old pay and prorate across effective dates without resetting leave', () => {
    const old = { period: 'MONTHLY', amount: 3000, commissionPercentage: 5 }
    const version = appendSalaryRate(old, { period: 'MONTHLY', amount: 6000, commissionPercentage: 10, effectiveFrom: '2026-09-16' }, '2026-09-16')
    assert.equal(salaryRateOn(version, '2026-09-15')?.amount, 3000)
    assert.equal(salaryRateOn(version, '2026-09-16')?.amount, 6000)
    const totals = historicalSalaryTotals(version, new Date('2026-09-01Z'), new Date('2026-09-30Z'), [], [{ date: '2026-09-15', netValue: 1000 }, { date: '2026-09-16', netValue: 1000 }])
    assert.equal(totals.baseSalary, 4500); assert.equal(totals.commissionAmount, 150)
    assert.equal(historicalSalaryTotals(version, new Date('2026-08-01Z'), new Date('2026-08-31Z'), [], []).baseSalary.toFixed(2), '3000.00')
    assert.throws(() => appendSalaryRate(version, { ...old, effectiveFrom: '2026-09-16' }, '2026-09-16'), { statusCode: 409 })
    assert.equal(minimumSalaryDate(version, new Date('2026-10-31Z'), '2026-09-01'), '2026-11-01')
    const shift = { startTime: '09:00', endTime: '17:00', paidLeaveDays: 1, leaveCutFullDay: 100 }
    const result = computeUserLine(old as any, [{ date: '2026-09-15', shift, status: null, logs: [] }, { date: '2026-09-16', shift, status: null, logs: [] }], { totalDays: 2, adjustmentTotal: 0, baseSalaryOverride: 300, commissionAmountOverride: 150 })
    assert.equal(result.leaveDeduction, 100); assert.equal(result.baseSalary, 300); assert.equal(result.commissionAmount, 150)
})
test('new effective date excludes earlier pay and hourly rates respect weekly offs', () => {
    const cfg = appendSalaryRate(null, { period: 'HOURLY', amount: 10, commissionPercentage: 0, effectiveFrom: '2026-09-16' }, '2026-09-01')
    assert.equal(salaryRateOn(cfg, '2026-09-15'), null)
    const shift = { startTime: '09:00', endTime: '17:00', breakMinutes: 60 }
    const days = [{ date: '2026-09-16', shift, status: null, logs: [] }, { date: '2026-09-17', shift, status: null, logs: [], isWeeklyOff: true }]
    assert.equal(historicalSalaryTotals(cfg, new Date('2026-09-15Z'), new Date('2026-09-17Z'), days, []).baseSalary, 70)
})
test('public payments cannot override internal ledger or cycle references', () => {
    const input = { userId: 'u', amount: 100, paymentDate: '2026-09-29' }
    const result = publicSalaryPayment(input)
    assert.equal(result.amount, 100); assert.ok(!('ledgerAmount' in result))
    for (const field of ['ledgerAmount', 'cycleId', 'cycleLineId']) assert.throws(() => publicSalaryPayment({ ...input, [field]: 1 }), { statusCode: 400 })
    for (const amount of [NaN, Infinity, -1, 0, 1.001, '100']) assert.throws(() => publicSalaryPayment({ ...input, amount }), { statusCode: 400 })
    assert.throws(() => publicSalaryPayment({ ...input, paymentDate: '2026-02-30' }), { statusCode: 400 })
    for (const role of ['user', 'biller', '']) assert.throws(() => assertSalaryManager(role), { statusCode: 403 })
})
test('salary mutation endpoints enforce management roles before reading or writing data', async () => {
    const { Readable } = await import('node:stream'); const { createEvent } = await import('h3')
    const old = (globalThis as any).requireAuthSession
    ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'u', companyId: 'c', role: 'user' } })
    try {
        for (const path of ['pay.post', 'pay-with-credit.post', 'clear-cycle.post', 'final-settlement.post', 'config.post', 'adjustment.post', 'payroll/run.post', 'payroll/cycle/[id].delete', 'payment/[id].put', 'payment/[id].delete']) {
            const handler = (await import(`../server/api/salary/${path}.ts`)).default as any
            const req = Readable.from([]) as any; req.url = '/api/salary/pay'; req.method = 'POST'; req.headers = {}
            const event = createEvent(req, {} as any); event.context.authorizedCompanyIds = Promise.resolve(['c'])
            await assert.rejects(handler(event), { statusCode: 403 }, path)
        }
    } finally { (globalThis as any).requireAuthSession = old }
})
test('payroll rolls cycle, lines and ledger back together, and reruns retain line IDs', async () => {
    const { Readable } = await import('node:stream'); const { createEvent } = await import('h3')
    const { prisma } = await import('../server/prisma')
    const handler = (await import('../server/api/salary/payroll/run.post')).default as any
    let state: any = { cycle: null, lines: [], ledger: [] }, failPosting = true
    const original = prisma.$transaction, oldAuth = (globalThis as any).requireAuthSession
    ;(globalThis as any).requireAuthSession = async () => ({ data: { companyId: 'c', id: 'manager', role: 'manager' } })
    ;(prisma as any).$transaction = async (callback: any, options: any) => {
        assert.equal(options.isolationLevel, 'Serializable')
        const staged = structuredClone(state)
        const shift = { startTime: '09:00', endTime: '17:00', workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], holidayPaid: true }
        const tx: any = {
            shiftAssignment: { findMany: async () => [{ userId: 'u', effectiveFrom: new Date('2026-01-01Z'), shift }] },
            salaryConfig: { findMany: async () => [{ userId: 'u', period: 'MONTHLY', amount: 3000, commissionPercentage: 0 }] },
            attendance: { findMany: async () => [] }, companyHoliday: { findMany: async () => [] }, leaveApplication: { findMany: async () => [] }, payrollAdjustment: { findMany: async () => [] }, entry: { findMany: async () => [] },
            payrollCycle: {
                findFirst: async () => staged.cycle,
                create: async ({ data }: any) => staged.cycle = { id: 'cycle', ...data },
                update: async ({ data }: any) => staged.cycle = { ...staged.cycle, ...data },
            },
            payrollCycleLine: {
                findMany: async () => staged.lines.map((line: any) => ({ ...line })),
                deleteMany: async ({ where }: any) => { staged.lines = staged.lines.filter((line: any) => where.userId.notIn.includes(line.userId)) },
                upsert: async ({ create }: any) => { const old = staged.lines.find((line: any) => line.userId === create.userId); if (old) Object.assign(old, create); else staged.lines.push({ id: 'stable-line', ...create }) },
            },
            $queryRawUnsafe: async (sql: string, ...values: any[]) => {
                if (sql.includes('INSERT INTO user_ledger_entries')) {
                    if (failPosting) throw Error('Injected posting failure')
                    staged.ledger.push({ id: values[0], amount: values[5] }); return [{ id: values[0] }]
                }
                if (sql.includes('DELETE FROM user_ledger_entries')) { staged.ledger = []; return [] }
                return []
            },
            $executeRawUnsafe: async () => 0,
        }
        const result = await callback(tx)
        state = staged
        return result
    }
    const event = (cycleId?: string) => {
        const json = JSON.stringify({ cycleId, periodStart: '2026-09-01', periodEnd: '2026-09-30', paymentDate: '2026-09-30' })
        const req = Readable.from([Buffer.from(json)]) as any; req.url = '/api/salary/payroll/run'; req.method = 'POST'; req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)) }
        const e = createEvent(req, {} as any); e.context.authorizedCompanyIds = Promise.resolve(['c']); return e
    }
    try {
        await assert.rejects(handler(event()), /Injected posting failure/)
        assert.deepEqual(state, { cycle: null, lines: [], ledger: [] })
        failPosting = false; await handler(event()); assert.equal(state.lines[0].id, 'stable-line'); assert.equal(state.ledger.length, 1)
        const before = structuredClone(state); failPosting = true
        await assert.rejects(handler(event('cycle')), /Injected posting failure/); assert.deepEqual(state, before)
        failPosting = false; await handler(event('cycle')); assert.equal(state.lines[0].id, 'stable-line'); assert.equal(state.ledger.length, 1)
    } finally { prisma.$transaction = original; (globalThis as any).requireAuthSession = oldAuth; await prisma.$disconnect() }
})
