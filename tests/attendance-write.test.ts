import assert from 'node:assert/strict'
import { attendanceDay, attendanceAnchor, localAttendanceTimes, writeAttendanceTimes, attendanceStaff, attendanceShift } from '../server/utils/attendance-write'

assert.throws(() => attendanceDay('2026-02-30'))
assert.throws(() => attendanceDay('not-a-date'))
assert.throws(() => attendanceAnchor('2026-09-29', '2026-09-28T00:00:00+05:30'))
const midnight = attendanceAnchor('2026-09-29', '2026-09-29T00:00:00+05:30')
assert.equal(midnight.toISOString(), '2026-09-28T18:30:00.000Z')
const overnight = localAttendanceTimes('2026-09-29', '2026-09-29T00:00:00+05:30', '22:00', '06:00', true)
assert.equal(overnight.checkOutAt!.getTime() - overnight.checkInAt!.getTime(), 8 * 3600000)
assert.equal(overnight.checkInAt!.toISOString(), '2026-09-29T16:30:00.000Z')
assert.throws(() => localAttendanceTimes('2026-09-29', '2026-09-29T00:00:00+05:30', '22:00', '06:00'))
assert.throws(() => localAttendanceTimes('2026-09-29', '2026-09-29T00:00:00+05:30', '25:00', ''))

const at = (time: string) => new Date(`2026-09-29T${time}:00Z`)
const logs = [
    { id: 'in', type: 'CHECK_IN', punchedAt: at('09:00') },
    { id: 'break-out', type: 'CHECK_OUT', punchedAt: at('12:00') },
    { id: 'break-in', type: 'CHECK_IN', punchedAt: at('13:00') },
    { id: 'out', type: 'CHECK_OUT', punchedAt: at('17:00') },
]
const writes: any[] = []
const tx: any = { attendanceLog: {
    findMany: async () => logs,
    update: async (args: any) => { writes.push(args) },
    create: async (args: any) => { writes.push(args) },
    delete: async (args: any) => { writes.push(args) },
} }
const attendance = { id: 'a', companyId: 'c', userId: 'u', checkInAt: at('08:30'), checkOutAt: at('18:00') }
await writeAttendanceTimes(tx, attendance, 'Correction')
assert.deepEqual(writes.map(w => w.where.id), ['in', 'out'])
assert.equal(writes[0].data.punchedAt.toISOString(), at('08:30').toISOString())
writes.length = 0
await assert.rejects(writeAttendanceTimes(tx, { ...attendance, checkInAt: at('12:30') }, null), /break punches/)
assert.equal(writes.length, 0, 'Conflicting correction must fail before changing logs')
await assert.rejects(writeAttendanceTimes(tx, { ...attendance, checkInAt: null, checkOutAt: null }, null), /break punches/)
tx.attendanceLog.findMany = async () => []
await writeAttendanceTimes(tx, attendance, 'Manual')
assert.deepEqual(writes.map(w => w.data.type), ['CHECK_IN', 'CHECK_OUT'])
assert.ok(writes.every(w => w.data.companyId === 'c' && w.data.userId === 'u' && w.data.attendanceId === 'a'))
await assert.rejects(attendanceStaff({ companyUser: { findFirst: async () => null } } as any, 'other-company', 'u'), /staff member/)
await assert.rejects(attendanceShift({ shift: { findFirst: async () => null } } as any, 'c', 'u', midnight, 'foreign-shift'), /Shift does not belong/)
console.log('Attendance write tests passed: dates, overnight times, correction logs, break conflicts and tenant validation')
