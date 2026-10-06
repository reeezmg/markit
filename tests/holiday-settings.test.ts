import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertHolidayManager, holidayYear, validateHoliday } from '../server/utils/holiday-settings'

test('rejects impossible dates and accepts leap day without UTC date drift', () => {
    for (const date of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-1', '1999-12-31', '2101-01-01']) {
        assert.throws(() => validateHoliday({ date }), { statusCode: 400 })
    }
    const holiday = validateHoliday({ date: '2028-02-29', name: '  Festival  ' })
    assert.equal(holiday.date.getFullYear(), 2028)
    assert.equal(holiday.date.getMonth(), 1)
    assert.equal(holiday.date.getDate(), 29)
    assert.equal(holiday.date.getHours(), 0)
    assert.equal(holiday.name, 'Festival')
})
test('validates untrusted input and optional names', () => {
    for (const input of [null, {}, { date: 1 }, { date: '2026-01-01', name: {} }, { date: '2026-01-01', name: 'a'.repeat(121) }]) {
        assert.throws(() => validateHoliday(input), { statusCode: 400 })
    }
    assert.equal(validateHoliday({ date: '2026-01-01', name: '  ' }).name, null)
})
test('bounds the year without accepting partial numbers or query arrays', () => {
    for (const value of [NaN, Infinity, 2026.5, 1999, 2101, '', '2026x', ['2026'], null]) {
        assert.throws(() => holidayYear(value), { statusCode: 400 })
    }
    assert.equal(holidayYear('2026'), 2026)
    assert.equal(holidayYear(2000), 2000)
    assert.equal(holidayYear(2100), 2100)
})
test('only management roles can mutate holidays', () => {
    for (const role of ['user', 'biller', '', 'ADMIN']) assert.throws(() => assertHolidayManager(role), { statusCode: 403 })
    for (const role of ['admin', 'manager', 'accountant']) assert.doesNotThrow(() => assertHolidayManager(role))
})

test('holiday endpoints enforce role, tenant ownership, duplicate protection and retired bulk actions', async () => {
    const { Readable } = await import('node:stream')
    const { createEvent } = await import('h3')
    const { prisma } = await import('../server/prisma')
    const create = (await import('../server/api/users/holidays.post')).default as any
    const update = (await import('../server/api/users/holidays/[id].put')).default as any
    const remove = (await import('../server/api/users/holidays/[id].delete')).default as any
    const bulk = (await import('../server/api/users/holidays/bulk.post')).default as any
    let role = 'manager'
    const previousAuth = (globalThis as any).requireAuthSession
    ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'staff', companyId: 'company-a', role } })
    const calls: any[] = []
    const model = prisma.companyHoliday
    const original = { create: model.create, updateMany: model.updateMany, deleteMany: model.deleteMany }
    const event = (method: string, body: any, companyId = 'company-a') => {
        const json = JSON.stringify(body)
        const req = Readable.from([Buffer.from(json)]) as any
        req.method = method; req.url = '/api/users/holidays/holiday-a'
        req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': companyId }
        const result = createEvent(req, {} as any)
        result.context.authorizedCompanyIds = Promise.resolve(['company-a'])
        result.context.params = { id: 'holiday-a' }
        return result
    }
    try {
        model.create = (async (args: any) => { calls.push(args); return { id: 'holiday-a', ...args.data } }) as any
        model.updateMany = (async (args: any) => { calls.push(args); return { count: 1 } }) as any
        model.deleteMany = (async (args: any) => { calls.push(args); return { count: 1 } }) as any
        const payload = { date: '2026-10-20', name: 'Festival', companyId: 'forged-company' }
        await create(event('POST', payload))
        assert.equal(calls.at(-1).data.companyId, 'company-a')
        await update(event('PUT', payload))
        assert.deepEqual(calls.at(-1).where, { id: 'holiday-a', companyId: 'company-a' })
        assert.equal(calls.at(-1).data.companyId, undefined)
        await remove(event('DELETE', {}))
        assert.deepEqual(calls.at(-1).where, { id: 'holiday-a', companyId: 'company-a' })
        const count = calls.length
        await assert.rejects(create(event('POST', payload, 'company-b')), { statusCode: 403 })
        await assert.rejects(bulk(event('POST', { year: 2026, clearWeekends: true })), { statusCode: 410 })
        role = 'user'
        for (const handler of [create, update, remove, bulk]) await assert.rejects(handler(event('POST', payload)), { statusCode: 403 })
        assert.equal(calls.length, count, 'Rejected operations must not write')
        role = 'manager'
        model.create = (async () => { throw { code: 'P2002' } }) as any
        await assert.rejects(create(event('POST', payload)), { statusCode: 409 })
        model.updateMany = (async () => ({ count: 0 })) as any
        await assert.rejects(update(event('PUT', payload)), { statusCode: 404 })
        model.updateMany = (async () => { throw { code: 'P2002' } }) as any
        await assert.rejects(update(event('PUT', payload)), { statusCode: 409 })
    } finally {
        Object.assign(model, original)
        ;(globalThis as any).requireAuthSession = previousAuth
        await prisma.$disconnect()
    }
})
