import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attendanceCalendarStatus } from '../utils/attendance-status'
import { saveAttendanceRequest, cancelAttendanceRequest, assertAttendanceManager } from '../server/utils/attendance-request'

test('calendar distinguishes recorded status, off days, leave, future and open punches', () => {
    const base = { date: '2026-09-28', today: '2026-09-29', hasPunch: false, openPunch: false, shift: { workDays: ['MONDAY'] } }
    const status = (extra: any) => attendanceCalendarStatus({ ...base, ...extra })
    assert.equal(status({}).text, 'A')
    assert.equal(status({ date: '2026-09-30' }).title, 'Future date')
    assert.equal(status({ date: '2026-09-29' }).text, 'WO')
    assert.equal(status({ holiday: true }).text, 'H')
    assert.equal(status({ leave: true }).text, 'L')
    assert.equal(status({ shift: null }).title, 'No assigned shift')
    assert.equal(status({ attendance: { status: 'ABSENT' } }).presentDays, 0)
    assert.equal(status({ attendance: { status: 'HALF_DAY' } }).presentDays, 0.5)
    assert.equal(status({ attendance: { status: 'PRESENT' } }).presentDays, 1)
    assert.equal(status({ openPunch: true, attendance: { status: 'PRESENT' } }).text, 'IN')
    assert.equal(status({ holiday: true, hasPunch: true }).text, 'P')
})

test('request writes validate identity, pending status, local times, and protected fields', async () => {
    const writes: any[] = []
    let existing: any = null
    const tx: any = { companyUser: { findFirst: async () => ({}) }, attendanceAdjustment: {
        findFirst: async ({ where }: any) => existing?.companyId === where.companyId ? existing : null,
        create: async ({ data }: any) => { writes.push(data); return data },
        update: async (args: any) => { writes.push(args); return args },
    } }
    const user = { id: 'u', role: 'user', companyId: 'c' }
    const body = { userId: 'u', date: '2026-09-28', dateAnchor: '2026-09-28T00:00:00+05:30', checkIn: '22:00', checkOut: '06:00', nextDay: true, reason: 'Missed punch', status: 'APPROVED', companyId: 'forged' }
    const result = await saveAttendanceRequest(tx, user, body)
    assert.equal(result.status, 'PENDING'); assert.equal(result.companyId, 'c')
    assert.equal(+result.requestedCheckOutAt - +result.requestedCheckInAt, 8 * 3600000)
    await assert.rejects(saveAttendanceRequest(tx, user, { ...body, userId: 'other' }), { statusCode: 403 })
    await assert.rejects(saveAttendanceRequest(tx, user, { ...body, nextDay: false }), { statusCode: 400 })
    await assert.rejects(saveAttendanceRequest(tx, user, { ...body, reason: '' }), { statusCode: 400 })
    await assert.rejects(saveAttendanceRequest(tx, user, { ...body, id: 'foreign' }), { statusCode: 404 })
    existing = { id: 'r', companyId: 'c', userId: 'u', status: 'APPROVED' }
    await assert.rejects(saveAttendanceRequest(tx, user, { ...body, id: 'r' }), { statusCode: 409 })
    await assert.rejects(cancelAttendanceRequest(tx, user, 'r'), { statusCode: 409 })
    existing.status = 'PENDING'
    await saveAttendanceRequest(tx, user, { ...body, id: 'r' })
    assert.equal(writes.at(-1).data.status, undefined)
    await cancelAttendanceRequest(tx, user, 'r')
    assert.equal(writes.at(-1).data.status, 'CANCELLED')
    existing.userId = 'other'
    await assert.rejects(cancelAttendanceRequest(tx, user, 'r'), { statusCode: 403 })
    await cancelAttendanceRequest(tx, { ...user, role: 'manager' }, 'r')
    for (const role of ['user', 'biller', '']) assert.throws(() => assertAttendanceManager(role), { statusCode: 403 })
    assert.doesNotThrow(() => assertAttendanceManager('manager'))
})
