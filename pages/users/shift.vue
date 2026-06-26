<script setup lang="ts">
import {
    useFindManyShift,
    useDeleteShift,
    useFindManyShiftAssignment,
    useCreateShiftAssignment,
    useDeleteShiftAssignment,
    useFindManyCompanyUser,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
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
const shiftModalOpen = ref(false)
const isSaving = ref(false)
const editingShift = ref<any>(null)
const shiftForm = reactive({
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
const overtimeModeOptions = ['NONE', 'HOURLY', 'DAILY']
const leavePeriodOptions = ['WEEKLY', 'MONTHLY', 'YEARLY']
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

const openCreateShift = () => {
    editingShift.value = null
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

const openEditShift = (shift: any) => {
    editingShift.value = shift
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
        toast.add({ title: 'Could not save shift', description: err?.message, color: 'red' })
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
    })),
)

const staffOptions = computed(() =>
    (staff.value ?? []).map((u: any) => ({
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

const openAssign = () => {
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
                        <UInput
                            v-model="search"
                            icon="i-heroicons-magnifying-glass-20-solid"
                            placeholder="Search shifts..."
                            size="sm"
                        />
                    </div>

                    <UTable
                        :rows="shifts || []"
                        :columns="shiftColumns"
                        :loading="shiftsLoading"
                        class="w-full"
                        :ui="{ td: { base: 'max-w-[0] truncate' }, tr: { base: 'cursor-pointer' } }"
                        @select="(row) => (selectedShift = row)"
                    >
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
                        :columns="assignmentColumns"
                        :loading="assignmentsLoading"
                        class="w-full"
                    >
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
        <UModal v-model="shiftModalOpen" :ui="{ width: 'sm:max-w-xl' }">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">
                        {{ editingShift ? 'Edit shift' : 'New shift' }}
                    </h3>
                </template>
                <div class="space-y-4">
                    <UFormGroup label="Name" required>
                        <UInput v-model="shiftForm.name" placeholder="e.g. Morning" />
                    </UFormGroup>
                    <div class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Start time" required>
                            <UInput v-model="shiftForm.startTime" type="time" />
                        </UFormGroup>
                        <UFormGroup label="End time" required>
                            <UInput v-model="shiftForm.endTime" type="time" />
                        </UFormGroup>
                    </div>
                    <UFormGroup label="Break (minutes)">
                        <UInput v-model.number="shiftForm.breakMinutes" type="number" min="0" placeholder="Optional" />
                    </UFormGroup>
                    <UFormGroup label="Work days">
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
                    <div class="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                        <div class="text-xs font-semibold uppercase text-gray-500">Overtime</div>
                        <div class="grid grid-cols-2 gap-3">
                            <UFormGroup label="Overtime mode"><USelect v-model="shiftForm.overtimeMode" :options="overtimeModeOptions" /></UFormGroup>
                            <UFormGroup :label="shiftForm.overtimeMode === 'DAILY' ? 'OT rate / day' : 'OT rate / hour'">
                                <UInput v-model.number="shiftForm.overtimeRate" type="number" min="0" :disabled="shiftForm.overtimeMode === 'NONE'" />
                            </UFormGroup>
                        </div>
                        <UFormGroup v-if="shiftForm.overtimeMode === 'DAILY'" label="Daily OT threshold (minutes)" hint="OT only counts after this many minutes that day">
                            <UInput v-model.number="shiftForm.otDailyThresholdMinutes" type="number" min="0" />
                        </UFormGroup>
                        <UFormGroup v-if="shiftForm.overtimeMode === 'HOURLY'" label="Hourly round-up (minutes)" hint="round up to a full hour when the extra minutes reach this">
                            <UInput v-model.number="shiftForm.otHourlyRoundMinutes" type="number" min="0" />
                        </UFormGroup>
                    </div>
                    <div class="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                        <div class="text-xs font-semibold uppercase text-gray-500">Leave / absence cuts</div>
                        <div class="grid grid-cols-3 gap-3">
                            <UFormGroup label="Full day"><UInput v-model.number="shiftForm.leaveCutFullDay" type="number" min="0" /></UFormGroup>
                            <UFormGroup label="Half day"><UInput v-model.number="shiftForm.leaveCutHalfDay" type="number" min="0" /></UFormGroup>
                            <UFormGroup label="Per hour"><UInput v-model.number="shiftForm.leaveCutPerHour" type="number" min="0" /></UFormGroup>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <UFormGroup label="No. of paid leaves" hint="per payroll cycle">
                                <UInput v-model.number="shiftForm.paidLeaveDays" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Holiday paid">
                                <UToggle v-model="shiftForm.holidayPaid" />
                            </UFormGroup>
                        </div>
                    </div>
                    <div class="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                        <div class="text-xs font-semibold uppercase text-gray-500">Late / early fines</div>
                        <div class="grid grid-cols-2 gap-3">
                            <UFormGroup label="Late after minutes">
                                <UInput v-model.number="shiftForm.lateEntryGraceMinutes" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Late fine">
                                <UInput v-model.number="shiftForm.lateEntryFine" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Early exit before minutes">
                                <UInput v-model.number="shiftForm.earlyExitGraceMinutes" type="number" min="0" />
                            </UFormGroup>
                            <UFormGroup label="Early exit fine">
                                <UInput v-model.number="shiftForm.earlyExitFine" type="number" min="0" />
                            </UFormGroup>
                        </div>
                    </div>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="shiftModalOpen = false" />
                        <UButton :loading="isSaving" label="Save" @click="submitShift" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Assign staff modal ─── -->
        <UModal v-model="assignModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">Assign staff to {{ selectedShift?.name }}</h3>
                </template>
                <div class="space-y-4">
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
