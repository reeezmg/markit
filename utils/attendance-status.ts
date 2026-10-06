export type CalendarStatus = { kind: string; text: string; title: string; presentDays: number }
export function attendanceCalendarStatus(input: { date: string; today: string; attendance?: any; shift?: any; holiday?: boolean; leave?: boolean; hasPunch: boolean; openPunch: boolean }): CalendarStatus {
    const cell = (kind: string, text: string, title: string, presentDays = 0) => ({ kind, text, title, presentDays })
    if (input.openPunch) return cell('warning', 'IN', input.date < input.today ? 'Open punch from an earlier day - check overnight shift or missing checkout' : 'Checked in - day in progress')
    const status = input.attendance?.status
    if (status === 'ABSENT') return cell('absent', 'A', 'Recorded absent')
    if (status === 'HALF_DAY') return cell('warning', 'HD', 'Recorded half day', 0.5)
    if (status === 'LEAVE') return cell('leave', 'L', 'Recorded leave')
    if (status === 'HOLIDAY') return cell('holiday', 'H', 'Recorded holiday')
    if (status === 'PRESENT' || input.hasPunch) return cell('present', 'P', 'Recorded present', 1)
    if (input.date > input.today) return cell('muted', '-', 'Future date')
    if (input.holiday) return cell('holiday', 'H', 'Company holiday')
    if (input.leave) return cell('leave', 'L', 'Approved leave (see Leave for duration and allowance)')
    if (!input.shift) return cell('muted', '-', 'No assigned shift')
    const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const working = input.shift.workDays?.length ? input.shift.workDays : weekdays.slice(1)
    if (!working.includes(weekdays[new Date(`${input.date}T00:00:00`).getDay()])) return cell('holiday', 'WO', 'Weekly off')
    if (input.date === input.today) return cell('muted', '-', 'No attendance yet today')
    return cell('absent', 'A', 'No attendance on a scheduled workday')
}
