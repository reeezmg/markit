import { shiftForDate, shiftPolicy, localDateKey } from './shift-policy'

/** Anchor and dateKey describe today's midnight in the caller's local timezone. */
export function overnightAttendanceWindow(attendance: any, anchor: Date, today: string, now: Date, grace = false) {
    if (!attendance?.shift) return false
    const date = new Date(attendance.date)
    if (date < new Date(+anchor - 86400000) || date >= anchor) return false
    const previous = new Date(`${today}T12:00:00`); previous.setDate(previous.getDate() - 1)
    const shift: any = shiftForDate(attendance.shift, localDateKey(previous))
    if (shift.endTime > shift.startTime) return false
    const [h, m] = shift.endTime.split(':').map(Number)
    const end = +anchor + (h * 60 + m) * 60000
    return +now <= end + (grace ? shiftPolicy(shift).overnightCheckoutHours * 3600000 : 0)
}
export function openOvernightAttendance(attendance: any, anchor: Date, today: string, now: Date) {
    if (!overnightAttendanceWindow(attendance, anchor, today, now, true)) return false
    const logs = [...(attendance.logs ?? [])].sort((a, b) => +new Date(b.punchedAt) - +new Date(a.punchedAt))
    return logs[0]?.type === 'CHECK_IN' || (logs.length === 0 && Boolean(attendance.checkInAt && !attendance.checkOutAt))
}
