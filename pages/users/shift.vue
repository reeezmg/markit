<script setup lang="ts">
const companyScope = useCompanyScope('table');
const $fetch = companyScope.fetch;

import { defaultShiftPolicy, shiftPolicy, localDateKey } from '~/utils/shift-policy'
import { useFindManyCompanyUser } from '~/lib/company-hooks/company-user';
import { useFindManyShift, useDeleteShift } from '~/lib/company-hooks/shift';
import { useFindManyShiftAssignment, useCreateShiftAssignment, useDeleteShiftAssignment } from '~/lib/company-hooks/shift-assignment';

const useAuth = () => companyScope.auth
const toast = useToast()
const companyId = computed(() => useAuth().session.value?.companyId)
const money = (v: any) => `â‚¹${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── Shift list ───
const search = ref('')
const selectedShift = ref<any>(null)

const shiftArgs = computed(() => ({
    where: {
        companyId: companyId.value,
        deleted: false,
        ...(search.value?.trim() && {
            name: { contains: search.value.trim(), mode: 'insensitive' as const },
        }),
    },
    include: { _count: { select: { assignments: true } } },
    orderBy: { name: 'asc' as const },
}))

const { data: shifts, isLoading: shiftsLoading, refetch: refetchShifts } = useFindManyShift(shiftArgs)

const shiftColumns = [
    { key: 'name', label: 'Shift', sortable: true },
    { key: 'timing', label: 'Timing' },
    { key: 'policy', label: 'Policy' },
    { key: 'assigned', label: 'Staff' },
    { key: 'actions', label: '' },
]

// ─── Create / edit shift ───
const shiftEditorBody = ref<HTMLElement | null>(null)
function scrollShiftSection(id: string) {
    shiftEditorBody.value?.querySelector('#shift-section-' + id)?.scrollIntoView({ block: 'start', behavior: 'auto' })
}
const missingCheckoutHelp: Record<string, string> = {
    LEGACY: 'Use recorded complete work periods as before. An unfinished check-in adds no work time; short-hours deductions may still apply.',
    REVIEW: 'Stop the payroll run until this missing checkout is corrected. No end time is guessed.',
    ABSENT: 'Treat the day as absent in payroll and apply the configured absence or paid-leave rules.',
    HALF_DAY: 'Treat the day as half-day in payroll and apply the configured half-day deduction.',
    SHIFT_END: 'For payroll only, assume the employee left at the scheduled shift end. The original punch record is not changed.',
}
const leaveHelp: Record<string, string> = {
    casual: 'Paid days for approved personal or occasional leave. Example: 1 day every month.',
    sick: 'Paid days for approved illness-related leave. Example: 6 days every year.',
    earned: 'The paid allowance for approved earned leave. This is a fixed allowance per period, not automatic accrual from days worked.',
    other: 'Paid days for other approved leave categories. Set 0 if these should be unpaid.',
}
const shiftModalOpen = ref(false)
const isSaving = ref(false)
const editingShift = ref<any>(null)
const shiftForm = reactive({
    policy: { ...defaultShiftPolicy },
    effectiveFrom: localDateKey(new Date()),
    name: '',
    startTime: '09:30',
    endTime: '18:00',
    workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as string[],
    breakMinutes: null as number | null,
    overtimeMode: 'NONE',
    overtimeRate: 0 as number,
    otDailyThresholdMinutes: 0 as number,
    otHourlyRoundMinutes: 0 as number,
    leaveCutFullDay: 0 as number,
    leaveCutHalfDay: 0 as number,
    leaveCutPerHour: 0 as number,
    paidLeaveDays: 0 as number,
    casualLeaveDays: 0 as number,
    casualLeavePeriod: 'MONTHLY',
    sickLeaveDays: 0 as number,
    sickLeavePeriod: 'MONTHLY',
    earnedLeaveDays: 0 as number,
    earnedLeavePeriod: 'YEARLY',
    otherLeaveDays: 0 as number,
    otherLeavePeriod: 'MONTHLY',
    holidayPaid: true as boolean,
    lateEntryGraceMinutes: 0 as number,
    lateEntryFine: 0 as number,
    earlyExitGraceMinutes: 0 as number,
    earlyExitFine: 0 as number,
})
const compensationOptions = [{label:'None',value:'NONE'},{label:'Extra pay',value:'PAY'},{label:'Compensatory leave',value:'COMP_OFF'},{label:'Pay and compensatory leave',value:'BOTH'}]
const missingCheckoutOptions = [{label:'Keep recorded-hours behavior',value:'LEGACY'},{label:'Require correction before payroll',value:'REVIEW'},{label:'Count as absent',value:'ABSENT'},{label:'Count as half-day',value:'HALF_DAY'},{label:'Assume scheduled shift end',value:'SHIFT_END'}]
const overtimeModeOptions = [{ label: 'No overtime pay', value: 'NONE' }, { label: 'Pay per overtime hour', value: 'HOURLY' }, { label: 'Fixed extra pay for the day', value: 'DAILY' }]
const leavePeriodOptions = [{ label: 'Every week', value: 'WEEKLY' }, { label: 'Every month', value: 'MONTHLY' }, { label: 'Every year', value: 'YEARLY' }]
const leavePolicyRows = [
    { key: 'casual', label: 'Casual Leave (CL)', days: 'casualLeaveDays', period: 'casualLeavePeriod' },
    { key: 'sick', label: 'Sick Leave (SL)', days: 'sickLeaveDays', period: 'sickLeavePeriod' },
    { key: 'earned', label: 'Earned Leave (EL)', days: 'earnedLeaveDays', period: 'earnedLeavePeriod' },
    { key: 'other', label: 'Other leaves', days: 'otherLeaveDays', period: 'otherLeavePeriod' },
]
const defaultWorkDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const workDayOptions = [
    { label: 'Sun', value: 'SUNDAY' },
    { label: 'Mon', value: 'MONDAY' },
    { label: 'Tue', value: 'TUESDAY' },
    { label: 'Wed', value: 'WEDNESDAY' },
    { label: 'Thu', value: 'THURSDAY' },
    { label: 'Fri', value: 'FRIDAY' },
    { label: 'Sat', value: 'SATURDAY' },
]
const getShiftWorkDays = (shift: any) => Array.isArray(shift?.workDays) && shift.workDays.length ? shift.workDays : defaultWorkDays
const normalizeWorkDays = (days: string[]) => workDayOptions.map((day) => day.value).filter((day) => days.includes(day))
const toggleWorkDay = (day: string, checked: boolean) => {
    shiftForm.workDays = checked
        ? Array.from(new Set([...shiftForm.workDays, day]))
        : shiftForm.workDays.filter((d) => d !== day)
}

const DeleteShift = useDeleteShift()

const openCreateShift = async () => {
    await companyScope.beginForm();
    editingShift.value = null
    shiftForm.policy = { ...defaultShiftPolicy }
    shiftForm.effectiveFrom = localDateKey(new Date())
    shiftForm.name = ''
    shiftForm.startTime = '09:30'
    shiftForm.endTime = '18:00'
    shiftForm.workDays = [...defaultWorkDays]
    shiftForm.breakMinutes = null
    shiftForm.overtimeMode = 'NONE'
    shiftForm.overtimeRate = 0
    shiftForm.otDailyThresholdMinutes = 0
    shiftForm.otHourlyRoundMinutes = 0
    shiftForm.leaveCutFullDay = 0
    shiftForm.leaveCutHalfDay = 0
    shiftForm.leaveCutPerHour = 0
    shiftForm.paidLeaveDays = 0
    shiftForm.casualLeaveDays = 0
    shiftForm.casualLeavePeriod = 'MONTHLY'
    shiftForm.sickLeaveDays = 0
    shiftForm.sickLeavePeriod = 'MONTHLY'
    shiftForm.earnedLeaveDays = 0
    shiftForm.earnedLeavePeriod = 'YEARLY'
    shiftForm.otherLeaveDays = 0
    shiftForm.otherLeavePeriod = 'MONTHLY'
    shiftForm.holidayPaid = true
    shiftForm.lateEntryGraceMinutes = 0
    shiftForm.lateEntryFine = 0
    shiftForm.earlyExitGraceMinutes = 0
    shiftForm.earlyExitFine = 0
    shiftModalOpen.value = true
}

const openEditShift = async (shift: any) => {
    await companyScope.beginForm(shift?.id ? { model: 'Shift', id: shift.id, companyId: shift.companyId } : null);
    editingShift.value = shift
    shiftForm.policy = shiftPolicy(shift)
    const latest = Array.isArray(shift.policyHistory) ? shift.policyHistory.at(-1)?.effectiveFrom : null
    const next = latest && latest >= localDateKey(new Date()) ? new Date(latest + 'T00:00:00') : null
    if (next) next.setDate(next.getDate() + 1)
    shiftForm.effectiveFrom = localDateKey(next || new Date())
    shiftForm.name = shift.name
    shiftForm.startTime = shift.startTime
    shiftForm.endTime = shift.endTime
    shiftForm.workDays = [...getShiftWorkDays(shift)]
    shiftForm.breakMinutes = shift.breakMinutes ?? null
    shiftForm.overtimeMode = shift.overtimeMode ?? 'NONE'
    shiftForm.overtimeRate = Number(shift.overtimeRate ?? 0)
    shiftForm.otDailyThresholdMinutes = shift.otDailyThresholdMinutes ?? 0
    shiftForm.otHourlyRoundMinutes = shift.otHourlyRoundMinutes ?? 0
    shiftForm.leaveCutFullDay = Number(shift.leaveCutFullDay ?? 0)
    shiftForm.leaveCutHalfDay = Number(shift.leaveCutHalfDay ?? 0)
    shiftForm.leaveCutPerHour = Number(shift.leaveCutPerHour ?? 0)
    shiftForm.paidLeaveDays = Number(shift.paidLeaveDays ?? 0)
    shiftForm.casualLeaveDays = Number(shift.casualLeaveDays ?? 0)
    shiftForm.casualLeavePeriod = shift.casualLeavePeriod ?? 'MONTHLY'
    shiftForm.sickLeaveDays = Number(shift.sickLeaveDays ?? 0)
    shiftForm.sickLeavePeriod = shift.sickLeavePeriod ?? 'MONTHLY'
    shiftForm.earnedLeaveDays = Number(shift.earnedLeaveDays ?? 0)
    shiftForm.earnedLeavePeriod = shift.earnedLeavePeriod ?? 'YEARLY'
    shiftForm.otherLeaveDays = Number(shift.otherLeaveDays ?? 0)
    shiftForm.otherLeavePeriod = shift.otherLeavePeriod ?? 'MONTHLY'
    shiftForm.holidayPaid = shift.holidayPaid ?? true
    shiftForm.lateEntryGraceMinutes = shift.lateEntryGraceMinutes ?? 0
    shiftForm.lateEntryFine = Number(shift.lateEntryFine ?? 0)
    shiftForm.earlyExitGraceMinutes = shift.earlyExitGraceMinutes ?? 0
    shiftForm.earlyExitFine = Number(shift.earlyExitFine ?? 0)
    shiftModalOpen.value = true
}

const submitShift = async () => {
    if (isSaving.value) return
    if (!shiftForm.name.trim()) {
        toast.add({ title: 'Shift name is required', color: 'red' })
        return
    }
    const workDays = normalizeWorkDays(shiftForm.workDays)
    if (!workDays.length) {
        toast.add({ title: 'Select at least one work day', color: 'red' })
        return
    }
    if (!companyId.value) return
    isSaving.value = true
    try {
        const data = {
            policy: { ...shiftForm.policy },
            effectiveFrom: shiftForm.effectiveFrom,
            name: shiftForm.name.trim(),
            startTime: shiftForm.startTime,
            endTime: shiftForm.endTime,
            workDays,
            breakMinutes: shiftForm.breakMinutes ? Number(shiftForm.breakMinutes) : null,
            overtimeMode: shiftForm.overtimeMode,
            overtimeRate: Number(shiftForm.overtimeRate) || 0,
            otDailyThresholdMinutes: Number(shiftForm.otDailyThresholdMinutes) || 0,
            otHourlyRoundMinutes: Number(shiftForm.otHourlyRoundMinutes) || 0,
            leaveCutFullDay: Number(shiftForm.leaveCutFullDay) || 0,
            leaveCutHalfDay: Number(shiftForm.leaveCutHalfDay) || 0,
            leaveCutPerHour: Number(shiftForm.leaveCutPerHour) || 0,
            paidLeaveDays: Number(shiftForm.paidLeaveDays) || 0,
            casualLeaveDays: Number(shiftForm.casualLeaveDays) || 0,
            casualLeavePeriod: shiftForm.casualLeavePeriod,
            sickLeaveDays: Number(shiftForm.sickLeaveDays) || 0,
            sickLeavePeriod: shiftForm.sickLeavePeriod,
            earnedLeaveDays: Number(shiftForm.earnedLeaveDays) || 0,
            earnedLeavePeriod: shiftForm.earnedLeavePeriod,
            otherLeaveDays: Number(shiftForm.otherLeaveDays) || 0,
            otherLeavePeriod: shiftForm.otherLeavePeriod,
            holidayPaid: Boolean(shiftForm.holidayPaid),
            lateEntryGraceMinutes: Number(shiftForm.lateEntryGraceMinutes) || 0,
            lateEntryFine: Number(shiftForm.lateEntryFine) || 0,
            earlyExitGraceMinutes: Number(shiftForm.earlyExitGraceMinutes) || 0,
            earlyExitFine: Number(shiftForm.earlyExitFine) || 0,
        }
        if (editingShift.value) {
            await $fetch(`/api/users/shifts/${editingShift.value.id}`, { method: 'PUT', body: data })
            if (selectedShift.value?.id === editingShift.value.id) {
                selectedShift.value = { ...selectedShift.value, ...data }
            }
            toast.add({ title: 'Shift updated', color: 'green' })
        } else {
            await $fetch('/api/users/shifts', { method: 'POST', body: data })
            toast.add({ title: 'Shift created', color: 'green' })
        }
        shiftModalOpen.value = false
        await refetchShifts()
    } catch (err: any) {
        toast.add({ title: 'Could not save shift', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

// ─── Delete shift ───
const deleteShiftModalOpen = ref(false)
const deletingShift = ref<any>(null)
const isDeleting = ref(false)

const askDeleteShift = (shift: any) => {
    deletingShift.value = shift
    deleteShiftModalOpen.value = true
}

const confirmDeleteShift = async () => {
    if (!deletingShift.value) return
    isDeleting.value = true
    try {
        await DeleteShift.mutateAsync({ where: { id: deletingShift.value.id } })
        if (selectedShift.value?.id === deletingShift.value.id) selectedShift.value = null
        deleteShiftModalOpen.value = false
        toast.add({ title: 'Shift deleted', color: 'green' })
        await refetchShifts()
    } catch (err: any) {
        toast.add({ title: 'Could not delete shift', description: err?.message, color: 'red' })
    } finally {
        isDeleting.value = false
    }
}

const shiftActions = (row: any) => [
    [
        { label: 'Edit', icon: 'i-heroicons-pencil-square', click: () => openEditShift(row) },
        { label: 'Delete', icon: 'i-heroicons-trash', click: () => askDeleteShift(row) },
    ],
]

// ─── Assignments for selected shift ───
const assignmentArgs = computed(() => {
    if (!selectedShift.value) return null
    return {
        where: { companyId: companyId.value, shiftId: selectedShift.value.id },
        include: { user: true },
        orderBy: { effectiveFrom: 'desc' as const },
    }
})

const { data: assignments, isLoading: assignmentsLoading, refetch: refetchAssignments } =
    useFindManyShiftAssignment(() => assignmentArgs.value ?? { where: { id: '__none__' }, take: 0 })

const assignmentColumns = [
    { key: 'name', label: 'Staff' },
    { key: 'effectiveFrom', label: 'From' },
    { key: 'effectiveTo', label: 'To' },
    { key: 'actions', label: '' },
]

// ─── Active staff for the assign dropdown ───
const { data: staff } = useFindManyCompanyUser(
    computed(() => ({
        where: { companyId: companyId.value, deleted: false, status: true },
        include: { user: true },
        orderBy: { name: 'asc' as const },
    })), { companyScope: 'form' } as any
)

const staffOptions = computed(() =>
    (staff.value ?? []).filter((u: any) => u.companyId === companyScope.companyId.value).map((u: any) => ({
        id: u.userId,
        label: u.name || u.user?.email || u.userId,
    })),
)

// ─── Assign user ───
const assignModalOpen = ref(false)
const isAssigning = ref(false)
const assignForm = reactive({
    userId: null as string | null,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
})

const CreateAssignment = useCreateShiftAssignment()
const DeleteAssignment = useDeleteShiftAssignment()

const openAssign = async () => {
    companyScope.record.value = null; await companyScope.selectOwner(selectedShift.value?.companyId);
    assignForm.userId = null
    assignForm.effectiveFrom = new Date().toISOString().slice(0, 10)
    assignForm.effectiveTo = ''
    assignModalOpen.value = true
}

const submitAssign = async () => {
    if (!selectedShift.value || !assignForm.userId) {
        toast.add({ title: 'Pick a staff member', color: 'red' })
        return
    }
    if (!companyId.value) return
    isAssigning.value = true
    try {
        await CreateAssignment.mutateAsync({
            data: {
                company: { connect: { id: companyId.value } },
                shift: { connect: { id: selectedShift.value.id } },
                user: {
                    connect: {
                        companyId_userId: { companyId: companyId.value, userId: assignForm.userId },
                    },
                },
                effectiveFrom: new Date(assignForm.effectiveFrom),
                effectiveTo: assignForm.effectiveTo ? new Date(assignForm.effectiveTo) : null,
            },
        })
        assignModalOpen.value = false
        toast.add({ title: 'Staff assigned', color: 'green' })
        await Promise.all([refetchAssignments(), refetchShifts()])
    } catch (err: any) {
        toast.add({ title: 'Could not assign', description: err?.message, color: 'red' })
    } finally {
        isAssigning.value = false
    }
}

const endAssignment = async (assignment: any) => {
    try {
        await DeleteAssignment.mutateAsync({ where: { id: assignment.id } })
        toast.add({ title: 'Assignment removed', color: 'green' })
        await Promise.all([refetchAssignments(), refetchShifts()])
    } catch (err: any) {
        toast.add({ title: 'Could not remove assignment', description: err?.message, color: 'red' })
    }
}

const fmtDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString('en-IN') : '—'
watch(companyScope.readIds, () => { selectedShift.value = null; });
</script>

<template>
    <UDashboardPanelContent class="p-4">

        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md">
            <!-- ─── Left: Shift list ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedShift ? 'w-[35%] min-w-[260px]' : 'w-full',
                ]"
            >
                <UCard
                    class="w-full"
                    :ui="{
                        base: '',
                        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                        header: { padding: 'px-4 py-5' },
                        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
                    }"
                >
                    <template #header>
                        <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                            <div>
                                <h1 class="text-lg font-semibold">Shifts</h1>
                                <p class="text-xs text-gray-500">Create shifts and assign staff.</p>
                            </div>
                            <UButton
                                icon="i-heroicons-plus"
                                size="sm"
                                label="New shift"
                                @click="openCreateShift"
                            />
                        </div>
                    </template>

                    <div class="p-3">
                        <CompanyTableFilter class="mb-3" />
                        <UInput
                            v-model="search"
                            icon="i-heroicons-magnifying-glass-20-solid"
                            placeholder="Search shifts..."
                            size="sm"
                        />
                    </div>

                    <UTable
                        :rows="shifts || []"
                        :columns="companyScope.columns(shiftColumns)"
                        :loading="shiftsLoading"
                        class="w-full"
                        :ui="{ td: { base: 'max-w-[0] truncate' }, tr: { base: 'cursor-pointer' } }"
                        @select="(row) => (selectedShift = row)"
                    >
                        <template #companyId-data="{ row }">{{ companyScope.companyName(row.companyId) }}</template>
<template #name-data="{ row }">
                            <div class="font-medium">{{ row.name }}</div>
                        </template>
                        <template #timing-data="{ row }">
                            <span class="font-mono text-xs">{{ row.startTime }} – {{ row.endTime }}</span>
                        </template>
                        <template #policy-data="{ row }">
                            <div class="space-y-0.5 text-xs">
                                <div v-if="row.overtimeMode !== 'NONE'">OT {{ row.overtimeMode }} · {{ money(row.overtimeRate) }}</div>
                                <div v-if="Number(row.leaveCutFullDay) || Number(row.leaveCutHalfDay) || Number(row.leaveCutPerHour)" class="font-mono">
                                    Cut {{ Number(row.leaveCutFullDay) }}/{{ Number(row.leaveCutHalfDay) }}/{{ Number(row.leaveCutPerHour) }}
                                </div>
                                <div v-if="Number(row.paidLeaveDays) || row.holidayPaid" class="text-gray-500">
                                    Leave {{ Number(row.paidLeaveDays || 0) }} · Holiday {{ row.holidayPaid ? 'paid' : 'unpaid' }}
                                </div>
                                <div
                                    v-if="Number(row.casualLeaveDays) || Number(row.sickLeaveDays) || Number(row.earnedLeaveDays) || Number(row.otherLeaveDays)"
                                    class="text-gray-500"
                                >
                                    CL {{ Number(row.casualLeaveDays || 0) }} · SL {{ Number(row.sickLeaveDays || 0) }} · EL {{ Number(row.earnedLeaveDays || 0) }}
                                </div>
                                <span v-if="row.overtimeMode === 'NONE' && !Number(row.leaveCutFullDay) && !Number(row.leaveCutHalfDay) && !Number(row.leaveCutPerHour) && !Number(row.paidLeaveDays) && !row.holidayPaid" class="text-gray-400">-</span>
                            </div>
                        </template>
                        <template #assigned-data="{ row }">
                            <UBadge color="gray" variant="subtle" size="xs">
                                {{ row._count?.assignments ?? 0 }}
                            </UBadge>
                        </template>
                        <template #actions-data="{ row }">
                            <div @click.stop>
                                <UDropdown :items="shiftActions(row)">
                                    <UButton
                                        color="gray"
                                        variant="ghost"
                                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                                        size="xs"
                                    />
                                </UDropdown>
                            </div>
                        </template>
                        <template #empty-state>
                            <div class="py-8 text-center text-sm text-gray-500">No shifts yet.</div>
                        </template>
                    </UTable>
                </UCard>
            </div>

            <!-- ─── Right: Shift detail ─── -->
            <div v-if="selectedShift" class="w-[65%] flex flex-col">
                <UCard
                    class="w-full"
                    :ui="{ header: { padding: 'px-4 py-5' }, body: { padding: 'p-4' } }"
                >
                    <template #header>
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <h2 class="text-lg font-semibold">{{ selectedShift.name }}</h2>
                                <p class="font-mono text-xs text-gray-500">
                                    {{ selectedShift.startTime }} – {{ selectedShift.endTime }}
                                    <span v-if="selectedShift.breakMinutes">
                                        · {{ selectedShift.breakMinutes }}m break
                                    </span>
                                    · {{ getShiftWorkDays(selectedShift).map((day) => day.slice(0, 3)).join(', ') }}
                                </p>
                            </div>
                            <div class="flex items-center gap-2">
                                <UButton
                                    icon="i-heroicons-user-plus"
                                    size="sm"
                                    label="Assign staff"
                                    @click="openAssign"
                                />
                                <UButton
                                    icon="i-heroicons-pencil-square"
                                    color="gray"
                                    variant="ghost"
                                    size="sm"
                                    @click="openEditShift(selectedShift)"
                                />
                                <UButton
                                    icon="i-heroicons-x-mark"
                                    color="gray"
                                    variant="ghost"
                                    size="sm"
                                    @click="selectedShift = null"
                                />
                            </div>
                        </div>
                    </template>

                    <div class="grid grid-cols-1 gap-3 mb-4 text-xs md:grid-cols-3">
                        <div>
                            <div class="font-semibold text-gray-500 uppercase">Overtime</div>
                            <div v-if="selectedShift.overtimeMode !== 'NONE'">{{ selectedShift.overtimeMode }} · {{ money(selectedShift.overtimeRate) }}</div>
                            <div v-else class="text-gray-400">Not enabled</div>
                        </div>
                        <div>
                            <div class="font-semibold text-gray-500 uppercase">Leave cuts</div>
                            <div class="font-mono">{{ Number(selectedShift.leaveCutFullDay) }}/{{ Number(selectedShift.leaveCutHalfDay) }}/{{ Number(selectedShift.leaveCutPerHour) }}</div>
                        </div>
                        <div>
                            <div class="font-semibold text-gray-500 uppercase">Paid leave / holiday</div>
                            <div>{{ Number(selectedShift.paidLeaveDays || 0) }} paid leaves</div>
                            <div>CL {{ Number(selectedShift.casualLeaveDays || 0) }}/{{ selectedShift.casualLeavePeriod || 'MONTHLY' }}</div>
                            <div>SL {{ Number(selectedShift.sickLeaveDays || 0) }}/{{ selectedShift.sickLeavePeriod || 'MONTHLY' }}</div>
                            <div>EL {{ Number(selectedShift.earnedLeaveDays || 0) }}/{{ selectedShift.earnedLeavePeriod || 'YEARLY' }}</div>
                            <div>Other {{ Number(selectedShift.otherLeaveDays || 0) }}/{{ selectedShift.otherLeavePeriod || 'MONTHLY' }}</div>
                            <div>Holiday {{ selectedShift.holidayPaid ? 'paid' : 'unpaid' }}</div>
                        </div>
                        <div>
                            <div class="font-semibold text-gray-500 uppercase">Late / early fines</div>
                            <div>Late {{ Number(selectedShift.lateEntryGraceMinutes ?? 0) }}m / {{ money(selectedShift.lateEntryFine) }}</div>
                            <div>Early {{ Number(selectedShift.earlyExitGraceMinutes ?? 0) }}m / {{ money(selectedShift.earlyExitFine) }}</div>
                        </div>
                    </div>

                    <div class="text-sm font-medium mb-2">Assigned staff</div>
                    <UTable
                        :rows="assignments || []"
                        :columns="companyScope.columns(assignmentColumns)"
                        :loading="assignmentsLoading"
                        class="w-full"
                    ><template #companyId-data="{ row }">{{ companyScope.companyName(row.companyId) }}</template>
                        <template #name-data="{ row }">
                            <div class="font-medium">{{ row.user?.name || '—' }}</div>
                            <div class="text-xs text-gray-500">{{ row.user?.phone || '' }}</div>
                        </template>
                        <template #effectiveFrom-data="{ row }">
                            <span class="text-xs">{{ fmtDate(row.effectiveFrom) }}</span>
                        </template>
                        <template #effectiveTo-data="{ row }">
                            <span class="text-xs">{{ fmtDate(row.effectiveTo) }}</span>
                        </template>
                        <template #actions-data="{ row }">
                            <UButton
                                icon="i-heroicons-trash"
                                color="red"
                                variant="ghost"
                                size="xs"
                                @click.stop="endAssignment(row)"
                            />
                        </template>
                        <template #empty-state>
                            <div class="py-8 text-center text-sm text-gray-500">
                                No staff assigned to this shift.
                            </div>
                        </template>
                    </UTable>
                </UCard>
            </div>
        </div>

        <!-- ─── Create / Edit shift modal ─── -->
        <UModal v-model="shiftModalOpen" fullscreen :prevent-close="isSaving" aria-labelledby="shift-editor-title">
            <div class="flex h-[100dvh] min-h-0 flex-col bg-gray-50 dark:bg-gray-950">
                <header class="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-8">
                    <div><h2 id="shift-editor-title" class="text-xl font-semibold">{{ editingShift ? 'Edit shift' : 'Add shift' }}</h2><p class="mt-1 text-sm text-gray-500">Start with the schedule. Then choose how attendance affects pay. Every field below includes an explanation.</p></div>
                    <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close shift form" :disabled="isSaving" @click="shiftModalOpen = false" />
                </header>
                <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
                    <nav aria-label="Shift form sections" class="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 lg:w-64 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-4"><button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('basics')">1. Shift basics</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('breaks')">2. Breaks and paid time</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('attendance')">3. Attendance and night shifts</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('overtime')">4. Overtime on normal work days</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('holidays')">5. Holidays and weekly days off</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('leave')">6. Paid leave allowances</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('deductions')">7. Absence and short-hours deductions</button>
<button type="button" class="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 lg:w-full" @click="scrollShiftSection('fines')">8. Late arrival and early leaving</button></nav>
                    <main ref="shiftEditorBody" class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
                        <div class="mx-auto max-w-5xl space-y-6">
                            <div class="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">Time guide: 60 minutes = 1 hour; 240 = 4 hours; 480 = 8 hours. Pay and deduction fields use your company's currency. Enter 0 for no monetary charge.</div>
                            <section id="shift-section-basics" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-basics">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">1</span><div><h3 id="shift-heading-basics" class="text-lg font-semibold">Shift basics</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Set the work schedule and the date these rules start.</p></div></div>
 <div class="space-y-5">
                    <CompanyFormField @transferred="shiftModalOpen = false" /><p v-if="companyScope.enabled.value" class="text-sm text-gray-500">Select the company or branch that owns this shift. Employees are assigned within that company.</p>

                    <UFormGroup label="Policy effective from" required help="The date these settings start applying. Older payroll keeps the previous rules. For an edit, choose a date after the last saved version."><UInput v-model="shiftForm.effectiveFrom" type="date" :min="localDateKey(new Date())" /></UFormGroup>
                    <UFormGroup label="Name" required help="A name you will recognize when assigning employees, such as Morning shift or Shop staff.">
                        <UInput v-model="shiftForm.name" placeholder="e.g. Morning" />
                    </UFormGroup>
                    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <UFormGroup label="Start time" required help="When employees are expected to begin work. Late-arrival rules compare check-in with this time.">
                            <UInput v-model="shiftForm.startTime" type="time" />
                        </UFormGroup>
                        <UFormGroup label="End time" required help="When work normally ends. An end time earlier than the start means the shift ends the next day, for example 10 PM to 6 AM.">
                            <UInput v-model="shiftForm.endTime" type="time" />
                        </UFormGroup>
                    </div>
                    <UFormGroup label="Work days" help="Select the usual working days. Unchecked days are weekly days off. Assign employees to this shift after saving.">
                        <div class="flex flex-wrap gap-x-4 gap-y-2">
                            <UCheckbox
                                v-for="day in workDayOptions"
                                :key="day.value"
                                :model-value="shiftForm.workDays.includes(day.value)"
                                :label="day.label"
                                @update:model-value="toggleWorkDay(day.value, Boolean($event))"
                            />
                        </div>
                    </UFormGroup>
</div>
 </section>
<section id="shift-section-breaks" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-breaks">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">2</span><div><h3 id="shift-heading-breaks" class="text-lg font-semibold">Breaks and paid time</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Decide how lunch and other breaks affect paid working hours.</p></div></div>
 <div class="space-y-5"><UFormGroup label="Break (minutes)" help="Total break allowance during the shift. Example: 60 means one hour. A 9 AM to 6 PM shift with a 60-minute unpaid break expects 8 working hours.">
                        <UInput v-model.number="shiftForm.breakMinutes" type="number" min="0" placeholder="Optional" />
                    </UFormGroup>
                    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <UFormGroup label="Break pay" help="Unpaid breaks reduce expected work hours. Paid breaks count recorded break time as paid time, up to your break allowance."><USelect v-model="shiftForm.policy.breakPay" :options="[{label:'Unpaid',value:'UNPAID'},{label:'Paid up to allowance',value:'PAID'}]" /></UFormGroup>
                        <UFormGroup v-if="shiftForm.policy.breakPay === 'UNPAID'" label="Break deduction" help="Recorded breaks use check-out/check-in gaps. Automatic minimum break also deducts any missing part of the allowance when staff do not record enough break time."><USelect v-model="shiftForm.policy.breakDeduction" :options="[{label:'Recorded punch breaks',value:'RECORDED'},{label:'Automatic minimum break',value:'AUTOMATIC'}]" /></UFormGroup>
                        <UFormGroup v-if="shiftForm.policy.breakPay === 'UNPAID' && shiftForm.policy.breakDeduction === 'AUTOMATIC'" label="Auto deduct after worked minutes" help="Only apply the automatic break after this much recorded work. Example: 360 means after 6 hours. Zero applies it whenever work is recorded; recorded breaks are not deducted twice."><UInput v-model.number="shiftForm.policy.breakAfterMinutes" type="number" min="0" max="1440" /></UFormGroup>
                    </div>
                    </div>
 </section>
<section id="shift-section-attendance" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-attendance">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">3</span><div><h3 id="shift-heading-attendance" class="text-lg font-semibold">Attendance and night shifts</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose how work hours and forgotten checkouts affect payroll.</p></div></div>
 <div class="space-y-5">

                        <UCheckbox v-model="shiftForm.policy.autoClassify" label="Use worked hours to decide full day, half day or absence" />
                        <p class="text-sm text-gray-500">When enabled, payroll classifies records marked present using the limits below. Explicit manual statuses remain unchanged. Turn it off to keep recorded attendance status.</p><div v-if="shiftForm.policy.autoClassify" class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <UFormGroup label="Full-day minimum minutes" help="At least this much paid work counts as a full day in payroll. Example: 480 means 8 hours. This cannot exceed the paid shift duration."><UInput v-model.number="shiftForm.policy.fullDayMinutes" type="number" min="1" max="1440" /></UFormGroup>
                            <UFormGroup label="Half-day minimum minutes" help="At least this much paid work, but less than the full-day minimum, counts as half a day. Less than this counts as absent. Example: 240 means 4 hours."><UInput v-model.number="shiftForm.policy.halfDayMinutes" type="number" min="1" max="1440" /></UFormGroup>
                        </div>
                        <UFormGroup label="When an employee forgets checkout" :help="missingCheckoutHelp[shiftForm.policy.missingCheckout]"><USelect v-model="shiftForm.policy.missingCheckout" :options="missingCheckoutOptions" /></UFormGroup>
                        <UFormGroup label="Overnight checkout grace (hours)" help="How long after a night shift ends an employee can close the previous night's attendance. Example: a 6 AM finish plus 2 hours allows checkout until 8 AM. This is not extra paid time by itself."><UInput v-model.number="shiftForm.policy.overnightCheckoutHours" type="number" min="0" max="12" step="0.5" /></UFormGroup>
                    </div>
 </section>
<section id="shift-section-overtime" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-overtime">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">4</span><div><h3 id="shift-heading-overtime" class="text-lg font-semibold">Overtime on normal work days</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Set extra pay for work beyond the expected shift hours.</p></div></div>
 <div class="space-y-5">

                        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <UFormGroup label="Overtime mode" help="Choose whether extra work beyond the expected shift hours earns no extra pay, pay per hour, or one fixed amount for that day."><USelect v-model="shiftForm.overtimeMode" :options="overtimeModeOptions" /></UFormGroup>
                            <UFormGroup :label="shiftForm.overtimeMode === 'DAILY' ? 'Extra pay for the day' : 'Extra pay per overtime hour'" help="Enter the money amount, not a percentage. Hourly mode pays for calculated overtime hours; daily mode pays this amount once after the threshold is met.">
                                <UInput v-model.number="shiftForm.overtimeRate" type="number" min="0" :disabled="shiftForm.overtimeMode === 'NONE'" />
                            </UFormGroup>
                        </div>
                        <UFormGroup v-if="shiftForm.overtimeMode === 'DAILY'" label="Daily OT threshold (minutes)" help="Minimum extra work before the fixed daily overtime amount is paid. Example: 30 means the employee must work at least 30 minutes extra.">
                            <UInput v-model.number="shiftForm.otDailyThresholdMinutes" type="number" min="0" />
                        </UFormGroup>
                        <UFormGroup v-if="shiftForm.overtimeMode === 'HOURLY'" label="Hourly round-up (minutes)" help="How leftover overtime minutes become a full paid hour. With 30: 1 hour 30 minutes pays 2 hours, but 1 hour 20 minutes pays 1. Zero always drops leftover minutes.">
                            <UInput v-model.number="shiftForm.otHourlyRoundMinutes" type="number" min="0" />
                        </UFormGroup>
                    </div>
 </section>
<section id="shift-section-holidays" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-holidays">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">5</span><div><h3 id="shift-heading-holidays" class="text-lg font-semibold">Holidays and weekly days off</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Decide whether working on a day off earns extra money, a paid day off later, or both.</p></div></div>
 <div class="space-y-5"><UFormGroup label="Pay employees on scheduled holidays" help="When enabled, a company holiday on a scheduled work day is paid even if the employee does not work. Extra pay for actually working that day is set separately below."><UToggle v-model="shiftForm.holidayPaid" /></UFormGroup>

                        <p class="text-xs text-gray-500">Extra hourly pay is added to normal salary. Holiday rules take priority when a holiday falls on a weekly off. Each eligible day can earn one compensatory leave day.</p>
                        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <UFormGroup label="Weekly-off compensation" help="What employees receive for working on an unchecked work day: nothing extra, money, one paid day off later, or both."><USelect v-model="shiftForm.policy.weeklyOffMode" :options="compensationOptions" /></UFormGroup>
                            <UFormGroup label="Holiday-work compensation" help="What employees receive for working on a company holiday. This rule takes priority if the holiday is also a weekly day off."><USelect v-model="shiftForm.policy.holidayWorkMode" :options="compensationOptions" /></UFormGroup>
                            <UFormGroup v-if="['PAY','BOTH'].includes(shiftForm.policy.weeklyOffMode)" label="Weekly-off extra pay / hour" help="Extra money for each paid working hour on a weekly day off, added to normal salary. Example: 100 per hour for 5 hours adds 500."><UInput v-model.number="shiftForm.policy.weeklyOffHourlyRate" type="number" min="0" step="0.01" /></UFormGroup>
                            <UFormGroup v-if="['PAY','BOTH'].includes(shiftForm.policy.holidayWorkMode)" label="Holiday extra pay / hour" help="Extra money for each paid working hour on a holiday. This replaces the usual overtime calculation for that holiday."><UInput v-model.number="shiftForm.policy.holidayHourlyRate" type="number" min="0" step="0.01" /></UFormGroup>
                            <UFormGroup v-if="[shiftForm.policy.weeklyOffMode, shiftForm.policy.holidayWorkMode].some(mode => ['COMP_OFF', 'BOTH'].includes(mode))" label="Minutes to earn compensatory leave" help="Minimum paid work needed on a qualifying holiday or weekly day off to earn one paid leave day. Example: 240 means 4 hours. Requires complete check-in/out punches."><UInput v-model.number="shiftForm.policy.compOffMinMinutes" type="number" min="1" max="1440" /></UFormGroup>
                            <UFormGroup v-if="[shiftForm.policy.weeklyOffMode, shiftForm.policy.holidayWorkMode].some(mode => ['COMP_OFF', 'BOTH'].includes(mode))" label="Compensatory leave expires after days" help="How long the earned day off remains available. Example: 90 means use it within 90 days. Zero means it never expires; it cannot be used on the day it is earned."><UInput v-model.number="shiftForm.policy.compOffExpiryDays" type="number" min="0" /></UFormGroup>
                        </div>
                    </div>
 </section>
<section id="shift-section-leave" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-leave">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">6</span><div><h3 id="shift-heading-leave" class="text-lg font-semibold">Paid leave allowances</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose automatic paid days or approved leave with separate allowances.</p></div></div>
 <div class="space-y-5">

                        <UCheckbox v-model="shiftForm.policy.typedLeaveEnabled" label="Set separate paid allowances for each leave type" />
                        <p class="text-xs text-gray-500">Turn this on to require approved leave applications and use the separate allowances below. Each allowance resets every selected week, month or year. Unused days do not carry forward. Leave beyond the allowance is unpaid.</p>
                        <div v-if="shiftForm.policy.typedLeaveEnabled" v-for="leave in leavePolicyRows" :key="leave.key" class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <UFormGroup :label="leave.label + ' days'" :help="leaveHelp[leave.key]"><UInput v-model.number="(shiftForm as any)[leave.days]" type="number" min="0" max="366" /></UFormGroup>
                            <UFormGroup label="Allowance period" help="How often this allowance resets: each calendar week (Monday start), month, or year. Unused days do not carry forward."><USelect v-model="(shiftForm as any)[leave.period]" :options="leavePeriodOptions" /></UFormGroup>
                        </div>
                        <UButton to="/users/leaves" color="gray" variant="soft">Leave applications and balances</UButton>
                    <UFormGroup v-if="!shiftForm.policy.typedLeaveEnabled" label="Automatic paid days per payroll run" help="Without leave applications, this automatically pays up to this many absent, leave or missing-attendance days in each payroll run. Set 0 to disable it."><UInput v-model.number="shiftForm.paidLeaveDays" type="number" min="0" /></UFormGroup></div>
 </section>
<section id="shift-section-deductions" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-deductions">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">7</span><div><h3 id="shift-heading-deductions" class="text-lg font-semibold">Absence and short-hours deductions</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Set the money deducted when unpaid work time is missed.</p></div></div>
 <div class="space-y-5">

                        <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
                            <UFormGroup label="Full day" help="Money deducted for one unpaid absent day. Zero means no full-day absence deduction."><UInput v-model.number="shiftForm.leaveCutFullDay" type="number" min="0" /></UFormGroup>
                            <UFormGroup label="Half day" help="Money deducted for a half-day absence when the per-hour deduction below is zero. If per-hour is set, half the expected shift hours times that rate is used instead."><UInput v-model.number="shiftForm.leaveCutHalfDay" type="number" min="0" /></UFormGroup>
                            <UFormGroup label="Per hour" help="Money deducted for each hour short of the expected work duration. Example: 100 per hour and 2 hours short deducts 200. Zero disables this hourly deduction."><UInput v-model.number="shiftForm.leaveCutPerHour" type="number" min="0" /></UFormGroup>
                        </div>
                        </div>
 </section>
<section id="shift-section-fines" class="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-7" aria-labelledby="shift-heading-fines">
 <div class="mb-6 flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">8</span><div><h3 id="shift-heading-fines" class="text-lg font-semibold">Late arrival and early leaving</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Set allowed delays and optional fixed fines.</p></div></div>
 <div class="space-y-5">

                        <UAlert color="amber" variant="subtle" title="Fines and hourly deductions can both apply" description="An employee who arrives late or leaves early can receive the fixed fine as well as the short-hours deduction from the previous section." />
<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <UFormGroup label="Late after minutes" help="Allowed delay after shift start before the late fine applies. Example: 10 allows arrival up to 10 minutes late; the fine starts beyond that.">
                                <UInput v-model.number="shiftForm.lateEntryGraceMinutes" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Late fine" help="One fixed deduction for a day when arrival exceeds the allowed delay. It is not a per-minute charge. Zero disables it.">
                                <UInput v-model.number="shiftForm.lateEntryFine" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Early exit before minutes" help="Allowed early departure before shift end. Example: 10 allows leaving up to 10 minutes early; the fine starts beyond that.">
                                <UInput v-model.number="shiftForm.earlyExitGraceMinutes" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Early exit fine" help="One fixed deduction for a day when checkout is earlier than the allowed limit. Zero disables it.">
                                <UInput v-model.number="shiftForm.earlyExitFine" type="number" min="0" />
                            </UFormGroup>
                        </div>
                    </div>
 </section>
                        </div>
                    </main>
                </div>
                <footer class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-8">
                    <p class="text-sm text-gray-500">{{ editingShift ? 'Changes use the effective date you selected.' : 'After saving, assign employees to this shift.' }}</p>
                    <div class="flex gap-2"><UButton color="gray" variant="ghost" label="Cancel" :disabled="isSaving" @click="shiftModalOpen = false" /><UButton :loading="isSaving" :disabled="companyScope.busy.value" label="Save shift" @click="submitShift" /></div>
                </footer>
            </div>
        </UModal>

        <!-- ─── Assign staff modal ─── -->
        <UModal v-model="assignModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">Assign staff to {{ selectedShift?.name }}</h3>
                </template>
                <div class="space-y-4">
                    <CompanyFormField locked @transferred="assignModalOpen = false" />
                    <UFormGroup label="Staff member" required>
                        <USelectMenu
                            v-model="assignForm.userId"
                            :options="staffOptions"
                            value-attribute="id"
                            option-attribute="label"
                            searchable
                            placeholder="Select staff"
                        />
                    </UFormGroup>
                    <div class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Effective from" required>
                            <UInput v-model="assignForm.effectiveFrom" type="date" />
                        </UFormGroup>
                        <UFormGroup label="Effective to">
                            <UInput v-model="assignForm.effectiveTo" type="date" />
                        </UFormGroup>
                    </div>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="assignModalOpen = false" />
                        <UButton :loading="isAssigning" label="Assign" @click="submitAssign" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Delete shift confirm ─── -->
        <UModal v-model="deleteShiftModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">Delete shift</h3>
                </template>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                    Delete <strong>{{ deletingShift?.name }}</strong>? This also removes its staff assignments.
                </p>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="deleteShiftModalOpen = false" />
                        <UButton color="red" :loading="isDeleting" label="Delete" @click="confirmDeleteShift" />
                    </div>
                </template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>
