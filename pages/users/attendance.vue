<script setup lang="ts">
import {
    useFindManyCompanyUser,
    useFindManyShift,
    useFindManyShiftAssignment,
    useFindManyAttendance,
    useUpsertAttendance,
    useCreateAttendanceLog,
    useFindManyAttendanceAdjustment,
    useCreateAttendanceAdjustment,
    useUpdateAttendanceAdjustment,
    useDeleteAttendanceAdjustment,
} from '~/lib/hooks'
import {
    dateKey,
    formatPunchTime,
    attendanceMetrics,
    attendanceSegments,
    segmentClass,
    latestPunchType,
    workingHours,
    breakHours,
    lateHours,
    earlyExitHours,
    overtimeHours,
    firstPunch,
    lastPunch,
    formatHoursBare,
    timeHHMM,
    type AttendanceEntry,
} from '~/utils/attendance'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = computed(() => useAuth().session.value?.companyId)
const currentUserId = computed(() => useAuth().session.value?.id)

const todayKey = dateKey(new Date())
const dayAnchor = (key: string) => new Date(`${key}T00:00:00`)
const dayEndAnchor = (key: string) => new Date(`${key}T23:59:59.999`)

const tabs = [
    { key: 'roster', label: 'Daily Roster', icon: 'i-heroicons-clipboard-document-check' },
    { key: 'monthly', label: 'Monthly View', icon: 'i-heroicons-table-cells' },
    { key: 'requests', label: 'Requests', icon: 'i-heroicons-pencil-square' },
    { key: 'approvals', label: 'Approvals', icon: 'i-heroicons-check-badge' },
]
const activeTab = ref(0)

// ─── Shared: active staff + shifts ───
const { data: staff } = useFindManyCompanyUser(
    computed(() => ({
        where: { companyId: companyId.value, deleted: false, status: true },
        include: { user: true },
        orderBy: { name: 'asc' as const },
    })),
)
const staffList = computed(() => staff.value ?? [])
const staffOptions = computed(() =>
    staffList.value.map((u: any) => ({ id: u.userId, label: u.name || u.user?.email || u.userId })),
)
const staffName = (userId: string) => {
    const u = staffList.value.find((s: any) => s.userId === userId)
    return u?.name || u?.user?.email || '—'
}

const { data: shifts } = useFindManyShift(
    computed(() => ({
        where: { companyId: companyId.value, deleted: false },
        orderBy: { name: 'asc' as const },
    })),
)
const shiftOptions = computed(() => (shifts.value ?? []).map((s: any) => ({ id: s.id, label: s.name })))

// ════════════════════════════════════════════════════════════
//  TAB 1 — Daily Roster
// ════════════════════════════════════════════════════════════
const selectedDate = ref(todayKey)
const rosterShiftId = ref<string | null>(null)

const { data: dayAttendances, isLoading: rosterLoading, refetch: refetchRoster } = useFindManyAttendance(
    computed(() => ({
        where: {
            companyId: companyId.value,
            date: { gte: dayAnchor(selectedDate.value), lte: dayEndAnchor(selectedDate.value) },
        },
        include: { logs: true, shift: true },
    })),
)

// Shift assignments effective on the selected day
const { data: activeAssignments } = useFindManyShiftAssignment(
    computed(() => ({
        where: {
            companyId: companyId.value,
            effectiveFrom: { lte: dayEndAnchor(selectedDate.value) },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: dayAnchor(selectedDate.value) } }],
        },
        include: { shift: true },
    })),
)
const assignmentFor = (userId: string) =>
    (activeAssignments.value ?? []).find((a: any) => a.userId === userId) ?? null

const roster = computed(() => {
    return staffList.value
        .map((u: any) => {
            const att = (dayAttendances.value ?? []).find((a: any) => a.userId === u.userId) ?? null
            const shift = att?.shift ?? assignmentFor(u.userId)?.shift ?? null
            const logs = (att?.logs ?? []).map((l: any) => ({
                id: l.id,
                type: l.type,
                punchedAt: l.punchedAt,
            }))
            const entry: AttendanceEntry = {
                date: selectedDate.value,
                logs,
                shift: shift ? { startTime: shift.startTime, endTime: shift.endTime } : null,
            }
            return {
                userId: u.userId,
                name: u.name || u.user?.email || u.userId,
                email: u.user?.email,
                attendanceId: att?.id ?? null,
                checkInAt: att?.checkInAt ?? null,
                checkOutAt: att?.checkOutAt ?? null,
                shift,
                shiftId: shift?.id ?? null,
                logs,
                entry,
            }
        })
        .filter((r) => !rosterShiftId.value || r.shiftId === rosterShiftId.value)
})

const checkedInCount = computed(() => roster.value.filter((r) => r.checkInAt).length)
const checkedOutCount = computed(() => roster.value.filter((r) => r.checkOutAt).length)
const logCount = computed(() => roster.value.reduce((sum, r) => sum + r.logs.length, 0))

const UpsertAttendance = useUpsertAttendance()
const CreateLog = useCreateAttendanceLog()
const busyKey = ref('')

async function punch(row: any, type: 'CHECK_IN' | 'CHECK_OUT') {
    if (!companyId.value) return
    busyKey.value = `${row.userId}:${type}`
    const now = new Date()
    const anchor = dayAnchor(selectedDate.value)
    try {
        const att: any = await UpsertAttendance.mutateAsync({
            where: {
                companyId_userId_date: {
                    companyId: companyId.value,
                    userId: row.userId,
                    date: anchor,
                },
            },
            create: {
                company: { connect: { id: companyId.value } },
                user: {
                    connect: { companyId_userId: { companyId: companyId.value, userId: row.userId } },
                },
                date: anchor,
                status: 'PRESENT',
                ...(row.shiftId && { shift: { connect: { id: row.shiftId } } }),
                ...(type === 'CHECK_IN' ? { checkInAt: now } : { checkOutAt: now }),
            },
            update: {
                ...(type === 'CHECK_IN' && !row.checkInAt ? { checkInAt: now } : {}),
                ...(type === 'CHECK_OUT' ? { checkOutAt: now } : {}),
                ...(row.shiftId && !row.shift?.id ? { shift: { connect: { id: row.shiftId } } } : {}),
            },
        })
        await CreateLog.mutateAsync({
            data: {
                company: { connect: { id: companyId.value } },
                user: {
                    connect: { companyId_userId: { companyId: companyId.value, userId: row.userId } },
                },
                ...(att?.id && { attendance: { connect: { id: att.id } } }),
                type,
                punchedAt: now,
                source: 'manual',
            },
        })
        toast.add({ title: type === 'CHECK_IN' ? 'Checked in' : 'Checked out', color: 'green' })
        await refetchRoster()
    } catch (err: any) {
        toast.add({ title: 'Could not mark attendance', description: err?.message, color: 'red' })
    } finally {
        busyKey.value = ''
    }
}

// ════════════════════════════════════════════════════════════
//  TAB 2 — Monthly View
// ════════════════════════════════════════════════════════════
type DisplayOption =
    | 'PUNCH_STATUS' | 'ATTENDANCE_STATUS' | 'LATE_ENTRY' | 'EARLY_EXIT'
    | 'CHECK_IN' | 'CHECK_OUT' | 'WORKING_HOURS' | 'OVERTIME_HOURS' | 'BREAK_HOURS'

const displayOptions: { label: string; value: DisplayOption; icon: string }[] = [
    { label: 'Punch Status', value: 'PUNCH_STATUS', icon: 'i-heroicons-check-circle' },
    { label: 'Attendance', value: 'ATTENDANCE_STATUS', icon: 'i-heroicons-information-circle' },
    { label: 'Late Entry', value: 'LATE_ENTRY', icon: 'i-heroicons-clock' },
    { label: 'Early Exit', value: 'EARLY_EXIT', icon: 'i-heroicons-arrow-right-on-rectangle' },
    { label: 'Check-In', value: 'CHECK_IN', icon: 'i-heroicons-arrow-left-on-rectangle' },
    { label: 'Check-Out', value: 'CHECK_OUT', icon: 'i-heroicons-arrow-right-on-rectangle' },
    { label: 'Working Hrs', value: 'WORKING_HOURS', icon: 'i-heroicons-clock' },
    { label: 'Overtime', value: 'OVERTIME_HOURS', icon: 'i-heroicons-plus-circle' },
    { label: 'Break Hrs', value: 'BREAK_HOURS', icon: 'i-heroicons-pause-circle' },
]
const displayOption = ref<DisplayOption>('PUNCH_STATUS')

const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ label, value: i + 1 }))
const now = new Date()
const years = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i)
const mvMonth = ref(now.getMonth() + 1)
const mvYear = ref(now.getFullYear())
const mvEmployee = ref<string | null>(null)

const monthRange = computed(() => {
    const from = new Date(mvYear.value, mvMonth.value - 1, 1)
    const to = new Date(mvYear.value, mvMonth.value, 0)
    return { from: dateKey(from), to: dateKey(to), dayCount: to.getDate() }
})

const days = computed(() =>
    Array.from({ length: monthRange.value.dayCount }, (_, i) => {
        const d = new Date(mvYear.value, mvMonth.value - 1, i + 1)
        return { day: i + 1, date: dateKey(d), weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }) }
    }),
)

const { data: monthAttendances, isLoading: monthlyLoading, refetch: refetchMonthly } = useFindManyAttendance(
    computed(() => ({
        where: {
            companyId: companyId.value,
            date: { gte: dayAnchor(monthRange.value.from), lte: dayEndAnchor(monthRange.value.to) },
            ...(mvEmployee.value && { userId: mvEmployee.value }),
        },
        include: { logs: true, shift: true },
    })),
)

const mvUsers = computed(() =>
    staffList.value.filter((u: any) => !mvEmployee.value || u.userId === mvEmployee.value),
)

function mvEntry(userId: string, date: string): AttendanceEntry & { attendance: any } {
    const att = (monthAttendances.value ?? []).find(
        (a: any) => a.userId === userId && dateKey(a.date) === date,
    )
    const shift = att?.shift ?? null
    return {
        date,
        logs: (att?.logs ?? []).map((l: any) => ({ id: l.id, type: l.type, punchedAt: l.punchedAt })),
        shift: shift ? { startTime: shift.startTime, endTime: shift.endTime } : null,
        attendance: att ?? null,
    }
}

function cellValue(userId: string, date: string): { kind: string; text: string; title: string } {
    const e = mvEntry(userId, date)
    const inLog = firstPunch(e.logs, 'CHECK_IN')
    const outLog = lastPunch(e.logs, 'CHECK_OUT')
    const present = Boolean(e.attendance || inLog || outLog)
    const opt = displayOption.value

    if (opt === 'PUNCH_STATUS')
        return present
            ? { kind: 'present', text: '●', title: 'Punch found' }
            : { kind: 'absent', text: '⊗', title: 'No punch' }
    if (opt === 'ATTENDANCE_STATUS')
        return e.attendance
            ? { kind: 'present', text: String(e.attendance.status).slice(0, 1), title: e.attendance.status }
            : { kind: 'absent', text: 'A', title: 'Absent' }
    if (opt === 'CHECK_IN')
        return inLog
            ? { kind: 'present', text: formatPunchTime(inLog.punchedAt), title: 'Check-in' }
            : { kind: 'muted', text: '-', title: 'No check-in' }
    if (opt === 'CHECK_OUT')
        return outLog
            ? { kind: 'present', text: formatPunchTime(outLog.punchedAt), title: 'Check-out' }
            : { kind: 'muted', text: '-', title: 'No check-out' }
    if (opt === 'LATE_ENTRY') {
        const h = lateHours(e)
        return h ? { kind: 'warning', text: formatHoursBare(h), title: 'Late hours' } : { kind: 'muted', text: '-', title: 'Not late' }
    }
    if (opt === 'EARLY_EXIT') {
        const h = earlyExitHours(e)
        return h ? { kind: 'warning', text: formatHoursBare(h), title: 'Early exit' } : { kind: 'muted', text: '-', title: 'Not early' }
    }
    if (opt === 'WORKING_HOURS') {
        const h = workingHours(e)
        return h ? { kind: 'present', text: formatHoursBare(h), title: 'Working hours' } : { kind: 'muted', text: '-', title: 'No hours' }
    }
    if (opt === 'OVERTIME_HOURS') {
        const h = overtimeHours(e)
        return h ? { kind: 'warning', text: formatHoursBare(h), title: 'Overtime' } : { kind: 'muted', text: '-', title: 'No overtime' }
    }
    const h = breakHours(e)
    return h ? { kind: 'warning', text: formatHoursBare(h), title: 'Break hours' } : { kind: 'muted', text: '-', title: 'No break' }
}

const cellClass = (kind: string) =>
    kind === 'present'
        ? 'text-green-600 dark:text-green-400'
        : kind === 'absent'
            ? 'text-red-500'
            : kind === 'warning'
                ? 'text-amber-500'
                : 'text-gray-400'

const isHourDisplay = computed(() =>
    ['LATE_ENTRY', 'EARLY_EXIT', 'WORKING_HOURS', 'OVERTIME_HOURS', 'BREAK_HOURS'].includes(displayOption.value),
)
function numericCell(userId: string, date: string) {
    const e = mvEntry(userId, date)
    switch (displayOption.value) {
        case 'LATE_ENTRY': return lateHours(e)
        case 'EARLY_EXIT': return earlyExitHours(e)
        case 'WORKING_HOURS': return workingHours(e)
        case 'OVERTIME_HOURS': return overtimeHours(e)
        case 'BREAK_HOURS': return breakHours(e)
        default: return 0
    }
}
function rowTotal(userId: string) {
    if (isHourDisplay.value)
        return formatHoursBare(days.value.reduce((s, d) => s + numericCell(userId, d.date), 0)) || '0'
    return days.value.filter((d) => cellValue(userId, d.date).kind === 'present').length
}

// ════════════════════════════════════════════════════════════
//  TAB 3 — Adjustment Requests
// ════════════════════════════════════════════════════════════
const { data: myAdjustments, isLoading: requestsLoading, refetch: refetchRequests } =
    useFindManyAttendanceAdjustment(
        computed(() => ({
            where: { companyId: companyId.value },
            include: { user: true },
            orderBy: { createdAt: 'desc' as const },
        })),
    )

const requestColumns = [
    { key: 'user', label: 'Staff' },
    { key: 'date', label: 'Date' },
    { key: 'requested', label: 'Requested In / Out' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
]

const requestModalOpen = ref(false)
const isSavingRequest = ref(false)
const editingRequest = ref<any>(null)
const requestForm = reactive({
    userId: null as string | null,
    date: todayKey,
    checkIn: '',
    checkOut: '',
    reason: '',
})

const CreateAdjustment = useCreateAttendanceAdjustment()
const UpdateAdjustment = useUpdateAttendanceAdjustment()
const DeleteAdjustment = useDeleteAttendanceAdjustment()

const openCreateRequest = () => {
    editingRequest.value = null
    requestForm.userId = null
    requestForm.date = todayKey
    requestForm.checkIn = ''
    requestForm.checkOut = ''
    requestForm.reason = ''
    requestModalOpen.value = true
}
const openEditRequest = (row: any) => {
    editingRequest.value = row
    requestForm.userId = row.userId
    requestForm.date = dateKey(row.date)
    requestForm.checkIn = row.requestedCheckInAt ? timeHHMM(row.requestedCheckInAt) : ''
    requestForm.checkOut = row.requestedCheckOutAt ? timeHHMM(row.requestedCheckOutAt) : ''
    requestForm.reason = row.reason
    requestModalOpen.value = true
}
const combine = (date: string, time: string) => (time ? new Date(`${date}T${time}:00`) : null)

const submitRequest = async () => {
    if (!requestForm.userId) return toast.add({ title: 'Pick a staff member', color: 'red' })
    if (!requestForm.reason.trim()) return toast.add({ title: 'Reason is required', color: 'red' })
    if (!companyId.value) return
    isSavingRequest.value = true
    try {
        const payload = {
            date: dayAnchor(requestForm.date),
            requestedCheckInAt: combine(requestForm.date, requestForm.checkIn),
            requestedCheckOutAt: combine(requestForm.date, requestForm.checkOut),
            reason: requestForm.reason.trim(),
        }
        if (editingRequest.value) {
            await UpdateAdjustment.mutateAsync({ where: { id: editingRequest.value.id }, data: payload })
            toast.add({ title: 'Request updated', color: 'green' })
        } else {
            await CreateAdjustment.mutateAsync({
                data: {
                    ...payload,
                    status: 'PENDING',
                    company: { connect: { id: companyId.value } },
                    user: {
                        connect: { companyId_userId: { companyId: companyId.value, userId: requestForm.userId } },
                    },
                },
            })
            toast.add({ title: 'Request submitted', color: 'green' })
        }
        requestModalOpen.value = false
        await Promise.all([refetchRequests(), refetchApprovals()])
    } catch (err: any) {
        toast.add({ title: 'Could not save request', description: err?.message, color: 'red' })
    } finally {
        isSavingRequest.value = false
    }
}
const deleteRequest = async (row: any) => {
    try {
        await DeleteAdjustment.mutateAsync({ where: { id: row.id } })
        toast.add({ title: 'Request deleted', color: 'green' })
        await Promise.all([refetchRequests(), refetchApprovals()])
    } catch (err: any) {
        toast.add({ title: 'Could not delete', description: err?.message, color: 'red' })
    }
}
const requestActions = (row: any) =>
    row.status === 'PENDING'
        ? [[
            { label: 'Edit', icon: 'i-heroicons-pencil-square', click: () => openEditRequest(row) },
            { label: 'Delete', icon: 'i-heroicons-trash', click: () => deleteRequest(row) },
        ]]
        : [[{ label: 'View only', icon: 'i-heroicons-lock-closed', disabled: true }]]

// ════════════════════════════════════════════════════════════
//  TAB 4 — Approvals
// ════════════════════════════════════════════════════════════
const statusFilter = ref<string>('PENDING')
const approvalUserFilter = ref<string | null>(null)
const statusOptions = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']

const { data: approvals, isLoading: approvalsLoading, refetch: refetchApprovals } =
    useFindManyAttendanceAdjustment(
        computed(() => ({
            where: {
                companyId: companyId.value,
                ...(statusFilter.value && { status: statusFilter.value }),
                ...(approvalUserFilter.value && { userId: approvalUserFilter.value }),
            },
            include: { user: true },
            orderBy: { date: 'desc' as const },
        })),
    )

const approvalColumns = [
    { key: 'user', label: 'Staff' },
    { key: 'date', label: 'Date' },
    { key: 'requested', label: 'Requested In / Out' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
]

const decisionModalOpen = ref(false)
const decisionAction = ref<'APPROVED' | 'REJECTED'>('APPROVED')
const decisionTarget = ref<any>(null)
const decisionNote = ref('')
const isDeciding = ref(false)

const openDecision = (row: any, action: 'APPROVED' | 'REJECTED') => {
    decisionTarget.value = row
    decisionAction.value = action
    decisionNote.value = ''
    decisionModalOpen.value = true
}

const submitDecision = async () => {
    if (!decisionTarget.value || !companyId.value) return
    isDeciding.value = true
    const row = decisionTarget.value
    try {
        await UpdateAdjustment.mutateAsync({
            where: { id: row.id },
            data: {
                status: decisionAction.value,
                decisionNote: decisionNote.value.trim() || null,
                decidedByUserId: currentUserId.value ?? null,
            },
        })
        // On approval, write the requested times onto the attendance row.
        if (decisionAction.value === 'APPROVED' && (row.requestedCheckInAt || row.requestedCheckOutAt)) {
            const anchor = dayAnchor(dateKey(row.date))
            await UpsertAttendance.mutateAsync({
                where: {
                    companyId_userId_date: {
                        companyId: companyId.value,
                        userId: row.userId,
                        date: anchor,
                    },
                },
                create: {
                    company: { connect: { id: companyId.value } },
                    user: {
                        connect: { companyId_userId: { companyId: companyId.value, userId: row.userId } },
                    },
                    date: anchor,
                    status: 'PRESENT',
                    checkInAt: row.requestedCheckInAt ?? null,
                    checkOutAt: row.requestedCheckOutAt ?? null,
                },
                update: {
                    ...(row.requestedCheckInAt && { checkInAt: row.requestedCheckInAt }),
                    ...(row.requestedCheckOutAt && { checkOutAt: row.requestedCheckOutAt }),
                },
            })
        }
        toast.add({ title: `Request ${decisionAction.value.toLowerCase()}`, color: 'green' })
        decisionModalOpen.value = false
        await Promise.all([refetchApprovals(), refetchRequests(), refetchRoster(), refetchMonthly()])
    } catch (err: any) {
        toast.add({ title: 'Could not save decision', description: err?.message, color: 'red' })
    } finally {
        isDeciding.value = false
    }
}

// ════════════════════════════════════════════════════════════
//  Import attendance from Excel
// ════════════════════════════════════════════════════════════
const importModalOpen = ref(false)
const importType = ref<'daily' | 'monthly'>('daily')
const importMonth = ref(now.getMonth() + 1)
const importYear = ref(now.getFullYear())
const importFile = ref<File | null>(null)
const isImporting = ref(false)
const importResult = ref<any>(null)

const importTypeOptions = [
    { label: 'Monthly', value: 'monthly' },
    { label: 'Daily', value: 'daily' },
]

const openImport = () => {
    importResult.value = null
    importFile.value = null
    importModalOpen.value = true
}

const onImportFile = (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    importFile.value = files && files.length ? files[0] : null
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

const submitImport = async () => {
    if (!importFile.value) return toast.add({ title: 'Choose an Excel file', color: 'red' })
    isImporting.value = true
    importResult.value = null
    try {
        const file = await fileToBase64(importFile.value)
        const payload: any = {
            file,
            type: importType.value,
            ...(importType.value === 'daily'
                ? {}
                : { month: importMonth.value, year: importYear.value }),
        }
        const res: any = await $fetch('/api/attendance/import', { method: 'POST', body: payload })
        importResult.value = res
        toast.add({
            title: `Imported ${res.imported} record(s) for ${res.matchedUsers} staff`,
            description: res.unmatchedCodes?.length
                ? `Unmatched codes: ${res.unmatchedCodes.join(', ')}`
                : undefined,
            color: res.imported ? 'green' : 'amber',
        })
        await Promise.all([refetchRoster(), refetchMonthly()])
    } catch (err: any) {
        toast.add({
            title: 'Import failed',
            description: err?.data?.statusMessage || err?.message,
            color: 'red',
        })
    } finally {
        isImporting.value = false
    }
}

// ─── shared helpers for templates ───
const statusColor = (s: string) =>
    s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : s === 'CANCELLED' ? 'gray' : 'amber'
const fmtDate = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—')
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="mb-4 flex items-start justify-between gap-3">
            <div>
                <h1 class="text-xl font-bold">Attendance</h1>
                <p class="text-sm text-gray-500">Mark, review, and adjust staff attendance.</p>
            </div>
            <UButton icon="i-heroicons-arrow-up-tray" color="primary" label="Import" @click="openImport" />
        </div>

        <UTabs v-model="activeTab" :items="tabs" class="w-full">
            <template #item="{ item, index }">
                <!-- ══════════ ROSTER ══════════ -->
                <div v-if="index === 0" class="pt-4 space-y-4">
                    <div class="flex flex-wrap items-end gap-3">
                        <UFormGroup label="Date">
                            <UInput v-model="selectedDate" type="date" size="sm" />
                        </UFormGroup>
                        <UFormGroup label="Shift">
                            <USelectMenu
                                v-model="rosterShiftId"
                                :options="shiftOptions"
                                value-attribute="id"
                                option-attribute="label"
                                placeholder="All shifts"
                                size="sm"
                                class="w-44"
                            />
                        </UFormGroup>
                        <UButton
                            v-if="rosterShiftId"
                            color="gray"
                            variant="ghost"
                            size="sm"
                            icon="i-heroicons-x-mark"
                            @click="rosterShiftId = null"
                        />
                    </div>

                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <UCard :ui="{ body: { padding: 'p-3' } }">
                            <div class="text-xs uppercase text-gray-500">Roster</div>
                            <div class="mt-1 text-xl font-bold">{{ roster.length }}</div>
                        </UCard>
                        <UCard :ui="{ body: { padding: 'p-3' } }">
                            <div class="text-xs uppercase text-gray-500">Checked in</div>
                            <div class="mt-1 text-xl font-bold text-green-600">{{ checkedInCount }}</div>
                        </UCard>
                        <UCard :ui="{ body: { padding: 'p-3' } }">
                            <div class="text-xs uppercase text-gray-500">Checked out</div>
                            <div class="mt-1 text-xl font-bold text-blue-600">{{ checkedOutCount }}</div>
                        </UCard>
                        <UCard :ui="{ body: { padding: 'p-3' } }">
                            <div class="text-xs uppercase text-gray-500">Punch logs</div>
                            <div class="mt-1 text-xl font-bold">{{ logCount }}</div>
                        </UCard>
                    </div>

                    <UCard :ui="{ header: { padding: 'px-4 py-3' }, body: { padding: '' } }">
                        <template #header>
                            <h3 class="text-base font-semibold">Roster for {{ fmtDate(selectedDate) }}</h3>
                        </template>

                        <div v-if="rosterLoading" class="py-8 text-center text-sm text-gray-500">Loading...</div>
                        <div v-else-if="!roster.length" class="py-8 text-center text-sm text-gray-500">No active staff.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <div
                                v-for="row in roster"
                                :key="row.userId"
                                class="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(180px,0.8fr)_minmax(320px,1.4fr)_auto] lg:items-center"
                            >
                                <div>
                                    <div class="text-sm font-medium">{{ row.name }}</div>
                                    <div class="text-xs text-gray-500">
                                        {{ row.email }}
                                        <span v-if="row.shift" class="ml-1">
                                            · {{ row.shift.name }} ({{ row.shift.startTime }}–{{ row.shift.endTime }})
                                        </span>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <div v-if="row.shift" class="space-y-1">
                                        <div class="flex h-3 w-full overflow-hidden rounded-sm bg-red-400/30 ring-1 ring-gray-200 dark:ring-gray-700">
                                            <div
                                                v-for="seg in attendanceSegments(row.entry, todayKey)"
                                                :key="seg.key"
                                                class="h-full min-w-[2px]"
                                                :class="segmentClass(seg.state)"
                                                :style="{ width: `${seg.width}%` }"
                                                :title="seg.title"
                                            />
                                        </div>
                                        <div class="grid grid-cols-2 gap-x-3 text-[11px] text-gray-500 sm:grid-cols-5">
                                            <span>In: <strong>{{ attendanceMetrics(row.entry).checkIn || '-' }}</strong></span>
                                            <span>Late: <strong>{{ attendanceMetrics(row.entry).late }}</strong></span>
                                            <span>Work: <strong>{{ attendanceMetrics(row.entry).work }}</strong></span>
                                            <span>Break: <strong>{{ attendanceMetrics(row.entry).break }}</strong></span>
                                            <span>OT: <strong>{{ attendanceMetrics(row.entry).overtime }}</strong></span>
                                        </div>
                                    </div>
                                    <div v-if="row.logs.length" class="flex flex-wrap gap-1.5">
                                        <UBadge
                                            v-for="log in row.logs"
                                            :key="log.id"
                                            :color="log.type === 'CHECK_IN' ? 'green' : 'blue'"
                                            variant="subtle"
                                            size="xs"
                                        >
                                            {{ log.type === 'CHECK_IN' ? 'In' : 'Out' }} {{ formatPunchTime(log.punchedAt) }}
                                        </UBadge>
                                    </div>
                                    <div v-else class="text-xs text-gray-400">No punches yet</div>
                                </div>

                                <div class="flex gap-2 lg:justify-end">
                                    <UButton
                                        icon="i-heroicons-arrow-left-on-rectangle"
                                        size="xs"
                                        :disabled="latestPunchType(row.logs) === 'CHECK_IN'"
                                        :loading="busyKey === `${row.userId}:CHECK_IN`"
                                        @click="punch(row, 'CHECK_IN')"
                                    >
                                        Check in
                                    </UButton>
                                    <UButton
                                        icon="i-heroicons-arrow-right-on-rectangle"
                                        color="gray"
                                        variant="soft"
                                        size="xs"
                                        :disabled="latestPunchType(row.logs) === 'CHECK_OUT' || !row.logs.length"
                                        :loading="busyKey === `${row.userId}:CHECK_OUT`"
                                        @click="punch(row, 'CHECK_OUT')"
                                    >
                                        Check out
                                    </UButton>
                                </div>
                            </div>
                        </div>
                    </UCard>
                </div>

                <!-- ══════════ MONTHLY ══════════ -->
                <div v-else-if="index === 1" class="pt-4 space-y-4">
                    <div class="flex flex-wrap items-end gap-3">
                        <UFormGroup label="Month">
                            <USelect v-model="mvMonth" :options="months" value-attribute="value" option-attribute="label" size="sm" class="w-36" />
                        </UFormGroup>
                        <UFormGroup label="Year">
                            <USelect v-model="mvYear" :options="years" size="sm" class="w-28" />
                        </UFormGroup>
                        <UFormGroup label="Employee">
                            <USelectMenu v-model="mvEmployee" :options="staffOptions" value-attribute="id" option-attribute="label" searchable placeholder="All staff" size="sm" class="w-48" />
                        </UFormGroup>
                        <UButton color="gray" variant="ghost" size="sm" icon="i-heroicons-arrow-path" @click="refetchMonthly()">Refresh</UButton>
                    </div>

                    <div class="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                        <button
                            v-for="opt in displayOptions"
                            :key="opt.value"
                            type="button"
                            class="flex h-12 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition"
                            :class="displayOption === opt.value
                                ? 'border-primary-500 bg-primary-500 text-white'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                            @click="displayOption = opt.value"
                        >
                            <UIcon :name="opt.icon" class="w-4 h-4 shrink-0" />
                            <span>{{ opt.label }}</span>
                        </button>
                    </div>

                    <div class="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                        <div class="overflow-auto">
                            <table class="min-w-max w-full border-collapse text-xs">
                                <thead class="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th class="sticky left-0 z-10 min-w-[180px] border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-semibold">Employee</th>
                                        <th v-for="d in days" :key="d.date" class="min-w-[44px] border-b border-r border-gray-200 dark:border-gray-700 px-1 py-1 text-center font-semibold">
                                            <div>{{ d.day }}</div>
                                            <div class="text-[10px] font-normal text-gray-400">{{ d.weekday }}</div>
                                        </th>
                                        <th class="min-w-[64px] border-b border-gray-200 dark:border-gray-700 bg-green-500/10 px-2 py-1 text-center font-semibold text-green-600">TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="u in mvUsers" :key="u.userId" class="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                        <td class="sticky left-0 z-10 border-r border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 font-medium">
                                            {{ u.name || u.user?.email }}
                                        </td>
                                        <td v-for="d in days" :key="`${u.userId}-${d.date}`" class="border-r border-t border-gray-200 dark:border-gray-700 px-1 py-1.5 text-center">
                                            <span :class="cellClass(cellValue(u.userId, d.date).kind)" class="font-semibold" :title="cellValue(u.userId, d.date).title">
                                                {{ cellValue(u.userId, d.date).text }}
                                            </span>
                                        </td>
                                        <td class="border-t border-gray-200 dark:border-gray-700 bg-green-500/5 px-2 py-1.5 text-center font-semibold text-green-600">
                                            {{ rowTotal(u.userId) }}
                                        </td>
                                    </tr>
                                    <tr v-if="!mvUsers.length">
                                        <td :colspan="days.length + 2" class="px-4 py-10 text-center text-sm text-gray-500">No staff.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-if="monthlyLoading" class="text-center text-xs text-gray-400">Loading...</div>
                </div>

                <!-- ══════════ REQUESTS ══════════ -->
                <div v-else-if="index === 2" class="pt-4 space-y-4">
                    <div class="flex justify-end">
                        <UButton icon="i-heroicons-plus" size="sm" label="New request" @click="openCreateRequest" />
                    </div>
                    <UCard :ui="{ body: { padding: '' } }">
                        <UTable :rows="myAdjustments || []" :columns="requestColumns" :loading="requestsLoading">
                            <template #user-data="{ row }">{{ row.user?.name || staffName(row.userId) }}</template>
                            <template #date-data="{ row }">{{ fmtDate(row.date) }}</template>
                            <template #requested-data="{ row }">
                                <span class="font-mono text-xs">
                                    {{ row.requestedCheckInAt ? formatPunchTime(row.requestedCheckInAt) : '—' }}
                                    /
                                    {{ row.requestedCheckOutAt ? formatPunchTime(row.requestedCheckOutAt) : '—' }}
                                </span>
                            </template>
                            <template #reason-data="{ row }">
                                <span class="text-xs">{{ row.reason }}</span>
                            </template>
                            <template #status-data="{ row }">
                                <UBadge :color="statusColor(row.status)" variant="subtle" size="xs">{{ row.status }}</UBadge>
                            </template>
                            <template #actions-data="{ row }">
                                <div @click.stop>
                                    <UDropdown :items="requestActions(row)">
                                        <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" size="xs" />
                                    </UDropdown>
                                </div>
                            </template>
                            <template #empty-state>
                                <div class="py-8 text-center text-sm text-gray-500">No adjustment requests.</div>
                            </template>
                        </UTable>
                    </UCard>
                </div>

                <!-- ══════════ APPROVALS ══════════ -->
                <div v-else-if="index === 3" class="pt-4 space-y-4">
                    <div class="flex flex-wrap items-end gap-3">
                        <UFormGroup label="Status">
                            <USelect v-model="statusFilter" :options="statusOptions" size="sm" class="w-40" />
                        </UFormGroup>
                        <UFormGroup label="Staff">
                            <USelectMenu v-model="approvalUserFilter" :options="staffOptions" value-attribute="id" option-attribute="label" searchable placeholder="All staff" size="sm" class="w-48" />
                        </UFormGroup>
                    </div>
                    <UCard :ui="{ body: { padding: '' } }">
                        <UTable :rows="approvals || []" :columns="approvalColumns" :loading="approvalsLoading">
                            <template #user-data="{ row }">{{ row.user?.name || staffName(row.userId) }}</template>
                            <template #date-data="{ row }">{{ fmtDate(row.date) }}</template>
                            <template #requested-data="{ row }">
                                <span class="font-mono text-xs">
                                    {{ row.requestedCheckInAt ? formatPunchTime(row.requestedCheckInAt) : '—' }}
                                    /
                                    {{ row.requestedCheckOutAt ? formatPunchTime(row.requestedCheckOutAt) : '—' }}
                                </span>
                            </template>
                            <template #reason-data="{ row }">
                                <span class="text-xs">{{ row.reason }}</span>
                                <div v-if="row.decisionNote" class="text-[11px] text-gray-400">Note: {{ row.decisionNote }}</div>
                            </template>
                            <template #status-data="{ row }">
                                <UBadge :color="statusColor(row.status)" variant="subtle" size="xs">{{ row.status }}</UBadge>
                            </template>
                            <template #actions-data="{ row }">
                                <div v-if="row.status === 'PENDING'" class="flex gap-1" @click.stop>
                                    <UButton color="green" variant="soft" size="xs" icon="i-heroicons-check" @click="openDecision(row, 'APPROVED')">Approve</UButton>
                                    <UButton color="red" variant="soft" size="xs" icon="i-heroicons-x-mark" @click="openDecision(row, 'REJECTED')">Reject</UButton>
                                </div>
                            </template>
                            <template #empty-state>
                                <div class="py-8 text-center text-sm text-gray-500">No requests match this filter.</div>
                            </template>
                        </UTable>
                    </UCard>
                </div>
            </template>
        </UTabs>

        <!-- ─── Request modal ─── -->
        <UModal v-model="requestModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">{{ editingRequest ? 'Edit request' : 'New adjustment request' }}</h3>
                </template>
                <div class="space-y-4">
                    <UFormGroup label="Staff member" required>
                        <USelectMenu
                            v-model="requestForm.userId"
                            :options="staffOptions"
                            value-attribute="id"
                            option-attribute="label"
                            searchable
                            :disabled="!!editingRequest"
                            placeholder="Select staff"
                        />
                    </UFormGroup>
                    <UFormGroup label="Date" required>
                        <UInput v-model="requestForm.date" type="date" />
                    </UFormGroup>
                    <div class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Requested check-in">
                            <UInput v-model="requestForm.checkIn" type="time" />
                        </UFormGroup>
                        <UFormGroup label="Requested check-out">
                            <UInput v-model="requestForm.checkOut" type="time" />
                        </UFormGroup>
                    </div>
                    <UFormGroup label="Reason" required>
                        <UTextarea v-model="requestForm.reason" :rows="2" placeholder="Why is this adjustment needed?" />
                    </UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="requestModalOpen = false" />
                        <UButton :loading="isSavingRequest" label="Submit" @click="submitRequest" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Decision modal ─── -->
        <UModal v-model="decisionModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">
                        {{ decisionAction === 'APPROVED' ? 'Approve' : 'Reject' }} request
                    </h3>
                </template>
                <div class="space-y-3">
                    <p class="text-sm text-gray-600 dark:text-gray-300">
                        {{ staffName(decisionTarget?.userId) }} · {{ fmtDate(decisionTarget?.date) }}
                    </p>
                    <UFormGroup label="Decision note">
                        <UTextarea v-model="decisionNote" :rows="2" placeholder="Optional note" />
                    </UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="decisionModalOpen = false" />
                        <UButton
                            :color="decisionAction === 'APPROVED' ? 'green' : 'red'"
                            :loading="isDeciding"
                            :label="decisionAction === 'APPROVED' ? 'Approve' : 'Reject'"
                            @click="submitDecision"
                        />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Import from Excel modal ─── -->
        <UModal v-model="importModalOpen" :ui="{ width: 'sm:max-w-lg' }">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">Import attendance from Excel</h3>
                    <p class="text-xs text-gray-500">
                        Empcode in the sheet is matched to each staff member's user code.
                    </p>
                </template>

                <div class="space-y-4">
                    <UFormGroup label="Report type" required>
                        <USelect
                            v-model="importType"
                            :options="importTypeOptions"
                            value-attribute="value"
                            option-attribute="label"
                        />
                    </UFormGroup>

                    <div v-if="importType === 'daily'" class="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800">
                        Date is read from the Excel file. Shift is taken from each user's assigned shift.
                    </div>
                    <div v-else class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Month" required>
                            <USelect
                                v-model="importMonth"
                                :options="months"
                                value-attribute="value"
                                option-attribute="label"
                            />
                        </UFormGroup>
                        <UFormGroup label="Year" required>
                            <USelect v-model="importYear" :options="years" />
                        </UFormGroup>
                    </div>


                    <UFormGroup label="Excel file (.xls / .xlsx)" required>
                        <input
                            type="file"
                            accept=".xls,.xlsx"
                            class="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-300"
                            @change="onImportFile"
                        />
                    </UFormGroup>

                    <UAlert
                        v-if="importResult"
                        :color="importResult.imported ? 'green' : 'amber'"
                        variant="subtle"
                        :title="`Imported ${importResult.imported} record(s) · ${importResult.matchedUsers} staff · ${importResult.skipped} skipped`"
                        :description="importResult.unmatchedCodes?.length
                            ? `Unmatched empcodes (no user with that code): ${importResult.unmatchedCodes.join(', ')}`
                            : 'All empcodes matched a staff member.'"
                    />
                </div>

                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Close" @click="importModalOpen = false" />
                        <UButton :loading="isImporting" label="Import" @click="submitImport" />
                    </div>
                </template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>
