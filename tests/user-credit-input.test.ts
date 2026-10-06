import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCreditManager, validateUserCredit } from '../server/utils/user-credit-input'
const body = { userId: 'staff', type: 'CREDIT', amount: 100.25, paymentMode: 'CASH', transactionDate: '2026-09-29', note: ' Advance ' }
test('credit input derives posting directions and keeps manual writes separate from sources', () => {
    const credit = validateUserCredit(body)
    assert.equal(credit.type, 'USER_CREDIT_BILL'); assert.equal(credit.direction, 'DEBIT'); assert.equal(credit.moneyDirection, 'GIVEN')
    assert.equal(credit.note, 'Advance'); assert.equal(credit.when.toISOString(), '2026-09-29T00:00:00.000Z')
    const payment = validateUserCredit({ ...body, type: 'PAYMENT', paymentMode: 'BANK' })
    assert.equal(payment.direction, 'CREDIT'); assert.equal(payment.moneyDirection, 'RECEIVED'); assert.equal(payment.type, 'CREDIT_BILL_PAYMENT')
    for (const input of [{ type: 'PAYROLL_ACCRUAL' }, { direction: 'CREDIT' }, { sourceType: 'PAYROLL' }, { sourceId: 'bill' }, { createdAt: '2026-01-01' }, { paymentMode: 'unknown' }]) {
        assert.throws(() => validateUserCredit({ ...body, ...input }), { statusCode: 400 })
    }
})
test('rejects invalid money, impossible dates and malformed fields', () => {
    for (const amount of [NaN, Infinity, -1, 0, 1.001, 1000000000, '20']) assert.throws(() => validateUserCredit({ ...body, amount }), { statusCode: 400 })
    for (const transactionDate of ['2026-02-30','2026-02-29','2026-13-01','2026-1-1','1999-12-31']) assert.throws(() => validateUserCredit({ ...body, transactionDate }), { statusCode: 400 })
    assert.doesNotThrow(() => validateUserCredit({ ...body, transactionDate: '2028-02-29', amount: 0.29 }))
    for (const input of [null, {}, { ...body, userId: '' }, { ...body, note: {} }, { ...body, note: 'a'.repeat(1001) }]) assert.throws(() => validateUserCredit(input), { statusCode: 400 })
})
test('only managers, admins and accountants can mutate credit', () => {
    for (const role of ['user','biller','']) assert.throws(() => assertCreditManager(role), { statusCode: 403 })
    for (const role of ['admin','manager','accountant']) assert.doesNotThrow(() => assertCreditManager(role))
})
test('write endpoints reject unauthorized and forged requests before acquiring a database connection', async () => {
    const { Readable } = await import('node:stream')
    const { createEvent } = await import('h3')
    const { pool } = await import('../server/db')
    const create = (await import('../server/api/users/credit-ledger.post')).default as any
    const edit = (await import('../server/api/users/credit-ledger/[id].put')).default as any
    const remove = (await import('../server/api/users/credit-ledger/[id].delete')).default as any
    let role = 'user'; let connections = 0
    const oldAuth = (globalThis as any).requireAuthSession
    const oldConnect = pool.connect
    ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'staff', role, companyId: 'company' } })
    pool.connect = (async () => { connections++; throw Error('Unexpected DB connection') }) as any
    const event = (payload: any, company = 'company') => {
        const json = JSON.stringify(payload); const req = Readable.from([Buffer.from(json)]) as any
        req.url = '/api/users/credit-ledger/entry'; req.method = 'POST'; req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': company }
        const e = createEvent(req, {} as any); e.context.params = { id: 'entry' }; e.context.authorizedCompanyIds = Promise.resolve(['company']); return e
    }
    try {
        for (const handler of [create, edit, remove]) await assert.rejects(handler(event(body)), { statusCode: 403 })
        role = 'admin'
        await assert.rejects(create(event(body, 'foreign-company')), { statusCode: 403 })
        await assert.rejects(create(event({ ...body, sourceType: 'PAYROLL' })), { statusCode: 400 })
        await assert.rejects(edit(event({ ...body, amount: -1 })), { statusCode: 400 })
        assert.equal(connections, 0)
    } finally { pool.connect = oldConnect; (globalThis as any).requireAuthSession = oldAuth }
})
test('edit/delete preserve ownership, reject reassignment and roll back posting failures', async () => {
    const { Readable } = await import('node:stream'); const { createEvent } = await import('h3')
    const { pool } = await import('../server/db')
    const edit = (await import('../server/api/users/credit-ledger/[id].put')).default as any
    const remove = (await import('../server/api/users/credit-ledger/[id].delete')).default as any
    const calls: { sql: string; values?: any[] }[] = []
    let found = true, failMoney = false
    const originalTime = new Date('2026-09-29T10:42:00Z')
    const client = { release() {}, async query(sql: string, values?: any[]) {
        calls.push({ sql, values })
        if (sql.includes('INSERT INTO money_transactions') && failMoney) throw Error('Posting failed')
        if (sql.includes('SELECT user_id, created_at') || sql.includes('DELETE FROM user_ledger_entries')) return { rowCount: found ? 1 : 0, rows: found ? [{ user_id: 'staff', created_at: originalTime }] : [] }
        if (sql.includes('FROM company_users')) return { rowCount: 1, rows: [{}] }
        return { rowCount: 0, rows: [] }
    } }
    const oldAuth = (globalThis as any).requireAuthSession, oldConnect = pool.connect
    ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'manager', role: 'manager', companyId: 'company' } })
    pool.connect = (async () => client) as any
    const event = (payload: any) => {
        const json = JSON.stringify(payload); const req = Readable.from([Buffer.from(json)]) as any
        req.url = '/api/users/credit-ledger/entry'; req.method = 'PUT'; req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)) }
        const e = createEvent(req, {} as any); e.context.params = { id: 'entry' }; e.context.authorizedCompanyIds = Promise.resolve(['company']); return e
    }
    try {
        await assert.rejects(edit(event({ ...body, userId: 'other' })), { statusCode: 400 })
        assert.equal(calls.at(-1)?.sql, 'ROLLBACK')
        found = false
        await assert.rejects(edit(event(body)), { statusCode: 404 })
        await assert.rejects(remove(event({})), { statusCode: 404 })
        found = true; calls.length = 0
        await edit(event(body))
        const update = calls.find(c => c.sql.includes('SET user_id = $3'))!
        assert.deepEqual(update.values?.slice(0,3), ['entry','company','staff'])
        assert.equal(+update.values![7], +originalTime)
        const lookup = calls.find(c => c.sql.includes('SELECT user_id, created_at'))!
        assert.ok(lookup.sql.includes("source_type = 'MANUAL'"))
        assert.equal(calls.at(-1)?.sql, 'COMMIT')
        calls.length = 0; failMoney = true
        await assert.rejects(edit(event(body)), /Posting failed/)
        assert.equal(calls.at(-1)?.sql, 'ROLLBACK')
        assert.ok(!calls.some(c => c.sql === 'COMMIT'))
        calls.length = 0; failMoney = false
        await remove(event({}))
        assert.ok(calls.some(c => c.sql.includes('DELETE FROM money_transactions') && c.values?.[1] === 'company'))
        assert.equal(calls.at(-1)?.sql, 'COMMIT')
    } finally { pool.connect = oldConnect; (globalThis as any).requireAuthSession = oldAuth }
})
