<script setup lang="ts">
import {
    useFindManyCompanyUser,
    useFindManyShiftAssignment,
    useFindManyBankAccount,
    useFindManySalaryConfig,
    useUpsertSalaryConfig,
    useFindManyPayrollAdjustment,
    useCreatePayrollAdjustment,
    useUpdatePayrollAdjustment,
    useDeletePayrollAdjustment,
    useFindManyPayrollCycle,
    useFindManySalaryPayment,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const route = useRoute()
const companyId = computed(() => useAuth().session.value?.companyId)
const now = new Date()
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const tabs = [
    { key: 'pay', label: 'Pay', icon: 'i-heroicons-banknotes' },
    { key: 'settings', label: 'Settings', icon: 'i-heroicons-cog-6-tooth' },
    { key: 'adjustments', label: 'Adjustments', icon: 'i-heroicons-plus-circle' },
    { key: 'payroll', label: 'Run Payroll', icon: 'i-heroicons-calculator' },
    { key: 'fnf', label: 'F & F', icon: 'i-heroicons-archive-box-arrow-down' },
]
const activeTab = ref(0)
const isCycleDetailRoute = computed(() => String(route.path).startsWith('/users/salary/cycle/'))

const money = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—')

const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ label, value: i + 1 }))
const years = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i)

// ─── Shift-assigned staff (payroll/salary apply only to them) ───
const { data: assignments } = useFindManyShiftAssignment(
    computed(() => ({
        where: { companyId: companyId.value, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
        include: { user: true },
    })),
)
const shiftStaff = computed(() => {
    const seen = new Map<string, any>()
    for (const a of assignments.value ?? []) if (!seen.has(a.userId)) seen.set(a.userId, a.user)
    return Array.from(seen.entries()).map(([userId, user]) => ({ userId, user }))
})
const staffOptions = computed(() =>
    shiftStaff.value.map((s) => ({ id: s.userId, label: s.user?.name || s.userId })),
)
const staffName = (userId: string) =>
    shiftStaff.value.find((s) => s.userId === userId)?.user?.name || userId

const { data: activeUsers, isLoading: fnfLoading, refetch: refetchActiveUsers } = useFindManyCompanyUser(
    computed(() => ({
        where: {
            companyId: companyId.value,
            status: true,
            deleted: false,
            user: { cleanup: false },
        },
        include: { user: true },
        orderBy: { name: 'asc' as const },
    })),
)

// ─── Dues (per-user) ───
const dues = ref<Record<string, any>>({})
const refreshDues = async () => {
    try {
        const res: any = await $fetch('/api/salary/dues')
        dues.value = Object.fromEntries((res.dues ?? []).map((d: any) => [d.userId, d]))
    } catch { /* non-critical */ }
}
onMounted(refreshDues)

// ─── Bank/Cash options for payouts ───
const { data: bankAccounts } = useFindManyBankAccount(
    computed(() => ({ where: { companyId: companyId.value } })),
)
const payModeOptions = computed(() => [
    { label: 'Cash', value: 'CASH:__primary__' },
    { label: 'Bank (Primary)', value: 'BANK:__primary__' },
    ...(bankAccounts.value ?? []).map((b: any) => ({
        label: `Bank · ${b.bankName || 'Bank'} ${b.accountNo || ''}`.trim(),
        value: `BANK:${b.id}`,
    })),
])
function splitPayMode(v: string): { paymentMode: 'CASH' | 'BANK'; bankAccountId: string | null } {
    const [mode, acc] = v.split(':')
    return { paymentMode: mode as 'CASH' | 'BANK', bankAccountId: acc === '__primary__' ? null : acc }
}

// ════════════════════════════════════════════════════════════
//  TAB 1 — Pay
// ════════════════════════════════════════════════════════════
const payForm = reactive({
    userId: null as string | null,
    amount: null as number | null,
    type: 'SALARY',
    payMode: 'CASH:__primary__',
    date: todayKey,
    note: '',
})
const isPaying = ref(false)
const payTypeOptions = ['SALARY', 'ADVANCE']

const selectedDue = computed(() => (payForm.userId ? dues.value[payForm.userId]?.due ?? 0 : null))
const selectedCreditBills = computed(() => (payForm.userId ? dues.value[payForm.userId]?.creditBills ?? 0 : 0))

const submitPay = async () => {
    if (!payForm.userId) return toast.add({ title: 'Pick a staff member', color: 'red' })
    if (!payForm.amount || payForm.amount <= 0) return toast.add({ title: 'Enter an amount', color: 'red' })
    isPaying.value = true
    try {
        const { paymentMode, bankAccountId } = splitPayMode(payForm.payMode)
        await $fetch('/api/salary/pay', {
            method: 'POST',
            body: {
                userId: payForm.userId,
                amount: payForm.amount,
                type: payForm.type,
                paymentMode,
                bankAccountId,
                paymentDate: payForm.date,
                note: payForm.note || null,
            },
        })
        toast.add({ title: 'Payment recorded', color: 'green' })
        payForm.amount = null
        payForm.note = ''
        await Promise.all([refreshDues(), refetchPayments()])
    } catch (err: any) {
        toast.add({ title: 'Payment failed', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isPaying.value = false
    }
}

const payFilterUser = ref<string | null>(null)
const payFilterType = ref<string | null>(null)
const { data: payments, isLoading: paymentsLoading, refetch: refetchPayments } = useFindManySalaryPayment(
    computed(() => ({
        where: {
            companyId: companyId.value,
            ...(payFilterUser.value && { userId: payFilterUser.value }),
            ...(payFilterType.value && { type: payFilterType.value }),
        },
        include: { user: true },
        orderBy: { paymentDate: 'desc' as const },
        take: 100,
    })),
)
const paymentColumns = [
    { key: 'date', label: 'Date' },
    { key: 'user', label: 'Staff' },
    { key: 'type', label: 'Type' },
    { key: 'mode', label: 'Mode' },
    { key: 'amount', label: 'Amount' },
    { key: 'note', label: 'Note' },
    { key: 'actions', label: '' },
]

const paymentEditOpen = ref(false)
const editingPayment = ref<any>(null)
const isEditingPayment = ref(false)
const paymentEditForm = reactive({
    userId: null as string | null,
    amount: null as number | null,
    type: 'SALARY',
    payMode: 'CASH:__primary__',
    date: todayKey,
    note: '',
})

const openEditPayment = (row: any) => {
    editingPayment.value = row
    paymentEditForm.userId = row.userId
    paymentEditForm.amount = Number(row.amount || 0)
    paymentEditForm.type = row.type || 'SALARY'
    paymentEditForm.payMode = row.paymentMode === 'BANK'
        ? `BANK:${row.bankAccountId || '__primary__'}`
        : 'CASH:__primary__'
    paymentEditForm.date = row.paymentDate ? new Date(row.paymentDate).toISOString().slice(0, 10) : todayKey
    paymentEditForm.note = row.note || ''
    paymentEditOpen.value = true
}

const submitEditPayment = async () => {
    if (!editingPayment.value) return
    if (!paymentEditForm.userId) return toast.add({ title: 'Pick a staff member', color: 'red' })
    if (!paymentEditForm.amount || paymentEditForm.amount <= 0) return toast.add({ title: 'Enter an amount', color: 'red' })
    isEditingPayment.value = true
    try {
        const { paymentMode, bankAccountId } = splitPayMode(paymentEditForm.payMode)
        await $fetch(`/api/salary/payment/${editingPayment.value.id}`, {
            method: 'PUT',
            body: {
                userId: paymentEditForm.userId,
                amount: paymentEditForm.amount,
                type: paymentEditForm.type,
                paymentMode,
                bankAccountId,
                paymentDate: paymentEditForm.date,
                note: paymentEditForm.note || null,
            },
        })
        toast.add({ title: 'Payment updated', color: 'green' })
        paymentEditOpen.value = false
        await Promise.all([refreshDues(), refetchPayments(), refetchCycles()])
    } catch (err: any) {
        toast.add({ title: 'Could not update payment', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isEditingPayment.value = false
    }
}

const deletePaymentRow = async (row: any) => {
    try {
        await $fetch(`/api/salary/payment/${row.id}`, { method: 'DELETE' })
        toast.add({ title: 'Payment deleted', color: 'green' })
        await Promise.all([refreshDues(), refetchPayments(), refetchCycles()])
    } catch (err: any) {
        toast.add({ title: 'Could not delete payment', description: err?.data?.statusMessage || err?.message, color: 'red' })
    }
}

// ════════════════════════════════════════════════════════════
//  TAB 2 — Settings (salary config per user)
// ════════════════════════════════════════════════════════════
const { data: configs, isLoading: configsLoading, refetch: refetchConfigs } = useFindManySalaryConfig(
    computed(() => ({ where: { companyId: companyId.value } })),
)
const configByUser = computed(() => Object.fromEntries((configs.value ?? []).map((c: any) => [c.userId, c])))

const settingsRows = computed(() =>
    shiftStaff.value.map((s) => ({ userId: s.userId, name: s.user?.name || s.userId, config: configByUser.value[s.userId] ?? null })),
)
const settingsColumns = [
    { key: 'name', label: 'Staff' },
    { key: 'period', label: 'Period' },
    { key: 'amount', label: 'Salary' },
    { key: 'commission', label: 'Commission' },
    { key: 'actions', label: '' },
]

const UpsertConfig = useUpsertSalaryConfig()
const configModalOpen = ref(false)
const isSavingConfig = ref(false)
const periodOptions = ['MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY']
const configForm = reactive({
    userId: '' as string,
    period: 'MONTHLY',
    amount: 0 as number,
    commissionPercentage: 0 as number,
})
const openConfig = (row: any) => {
    const c = row.config
    configForm.userId = row.userId
    configForm.period = c?.period ?? 'MONTHLY'
    configForm.amount = Number(c?.amount ?? 0)
    configForm.commissionPercentage = Number(c?.commissionPercentage ?? 0)
    configModalOpen.value = true
}
const submitConfig = async () => {
    if (!companyId.value) return
    isSavingConfig.value = true
    try {
        const data = {
            period: configForm.period,
            amount: Number(configForm.amount) || 0,
            commissionPercentage: Number(configForm.commissionPercentage) || 0,
        }
        await UpsertConfig.mutateAsync({
            where: { companyId_userId: { companyId: companyId.value, userId: configForm.userId } },
            create: {
                ...data,
                company: { connect: { id: companyId.value } },
                user: { connect: { companyId_userId: { companyId: companyId.value, userId: configForm.userId } } },
            },
            update: data,
        })
        toast.add({ title: 'Salary settings saved', color: 'green' })
        configModalOpen.value = false
        await refetchConfigs()
    } catch (err: any) {
        toast.add({ title: 'Could not save', description: err?.message, color: 'red' })
    } finally {
        isSavingConfig.value = false
    }
}

// ════════════════════════════════════════════════════════════
//  TAB 3 — Adjustments
// ════════════════════════════════════════════════════════════
const showAdjHistory = ref(false)
const { data: adjustments, isLoading: adjLoading, refetch: refetchAdjustments } = useFindManyPayrollAdjustment(
    computed(() => ({
        where: {
            companyId: companyId.value,
            ...(showAdjHistory.value ? { status: { not: 'PENDING' } } : { status: 'PENDING' }),
        },
        include: { user: true },
        orderBy: { createdAt: 'desc' as const },
    })),
)
const adjColumns = [
    { key: 'user', label: 'Staff' },
    { key: 'kind', label: 'Type' },
    { key: 'label', label: 'Label' },
    { key: 'amount', label: 'Amount' },
    { key: 'period', label: 'Month' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
]
const CreateAdj = useCreatePayrollAdjustment()
const UpdateAdj = useUpdatePayrollAdjustment()
const DeleteAdj = useDeletePayrollAdjustment()
const adjForm = reactive({
    userId: null as string | null,
    kind: 'ADDITION',
    label: '',
    amount: null as number | null,
    reason: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
})
const additionAdjustmentOptions = [
    'Bonus',
    'Incentive',
    'Allowance',
    'Reimbursement',
    'Arrears',
    'Commission correction',
    'Festival bonus',
    'Other addition',
]
const deductionAdjustmentOptions = [
    'Advance recovery',
    'Penalty',
    'Loan recovery',
    'Damage recovery',
    'Uniform deduction',
    'Leave correction',
    'Late fine correction',
    'Other deduction',
]
const adjustmentLabelOptions = computed(() =>
    adjForm.kind === 'ADDITION' ? additionAdjustmentOptions : deductionAdjustmentOptions,
)
watch(() => adjForm.kind, () => {
    if (!adjustmentLabelOptions.value.includes(adjForm.label)) adjForm.label = ''
})
const isSavingAdj = ref(false)
const submitAdj = async () => {
    if (!adjForm.userId) return toast.add({ title: 'Pick a staff member', color: 'red' })
    if (!adjForm.label.trim()) return toast.add({ title: 'Enter a label', color: 'red' })
    if (!adjForm.amount || adjForm.amount <= 0) return toast.add({ title: 'Enter an amount', color: 'red' })
    if (!companyId.value) return
    isSavingAdj.value = true
    try {
        await CreateAdj.mutateAsync({
            data: {
                kind: adjForm.kind,
                label: adjForm.label.trim(),
                amount: Number(adjForm.amount),
                reason: adjForm.reason || null,
                month: Number(adjForm.month),
                year: Number(adjForm.year),
                status: 'PENDING',
                company: { connect: { id: companyId.value } },
                user: { connect: { companyId_userId: { companyId: companyId.value, userId: adjForm.userId } } },
            },
        })
        toast.add({ title: 'Adjustment added', color: 'green' })
        adjForm.label = ''
        adjForm.amount = null
        adjForm.reason = ''
        await refetchAdjustments()
    } catch (err: any) {
        toast.add({ title: 'Could not add', description: err?.message, color: 'red' })
    } finally {
        isSavingAdj.value = false
    }
}
const cancelAdj = async (row: any) => {
    try {
        await UpdateAdj.mutateAsync({ where: { id: row.id }, data: { status: 'CANCELLED' } })
        toast.add({ title: 'Adjustment cancelled', color: 'green' })
        await refetchAdjustments()
    } catch (err: any) {
        toast.add({ title: 'Could not cancel', description: err?.message, color: 'red' })
    }
}
const deleteAdj = async (row: any) => {
    try {
        await DeleteAdj.mutateAsync({ where: { id: row.id } })
        toast.add({ title: 'Adjustment deleted', color: 'green' })
        await refetchAdjustments()
    } catch (err: any) {
        toast.add({ title: 'Could not delete', description: err?.message, color: 'red' })
    }
}
const adjActions = (row: any) =>
    row.status === 'PENDING'
        ? [[
            { label: 'Cancel', icon: 'i-heroicons-no-symbol', click: () => cancelAdj(row) },
            { label: 'Delete', icon: 'i-heroicons-trash', click: () => deleteAdj(row) },
        ]]
        : [[{ label: 'Processed', icon: 'i-heroicons-lock-closed', disabled: true }]]

// ════════════════════════════════════════════════════════════
//  TAB 4 — Run Payroll (cycles)
// ════════════════════════════════════════════════════════════
const { data: cycles, isLoading: cyclesLoading, refetch: refetchCycles } = useFindManyPayrollCycle(
    computed(() => ({
        where: { companyId: companyId.value },
        include: { _count: { select: { lines: true } } },
        orderBy: [{ year: 'desc' as const }, { month: 'desc' as const }],
    })),
)
const cycleColumns = [
    { key: 'period', label: 'Cycle' },
    { key: 'dates', label: 'Pay period' },
    { key: 'paymentDate', label: 'Payment date' },
    { key: 'users', label: 'Staff' },
    { key: 'totalNet', label: 'Total net' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
]

const cycleModalOpen = ref(false)
const isRunningCycle = ref(false)
const editingCycle = ref<any>(null)
const cycleForm = reactive({
    paymentDate: todayKey,
    periodStart: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    periodEnd: todayKey,
    includeUserIds: [] as string[],
    excludeUserIds: [] as string[],
})
const cycleMonthYearFromStart = () => {
    const start = new Date(cycleForm.periodStart)
    return {
        month: start.getMonth() + 1,
        year: start.getFullYear(),
    }
}
const cycleNameFromPeriod = () => `${fmtDate(cycleForm.periodStart)} - ${fmtDate(cycleForm.periodEnd)}`
const openCreateCycle = () => {
    editingCycle.value = null
    const m = now.getMonth() + 1
    cycleForm.paymentDate = todayKey
    cycleForm.periodStart = `${now.getFullYear()}-${String(m).padStart(2, '0')}-01`
    cycleForm.periodEnd = `${now.getFullYear()}-${String(m).padStart(2, '0')}-${String(new Date(now.getFullYear(), m, 0).getDate()).padStart(2, '0')}`
    cycleForm.includeUserIds = []
    cycleForm.excludeUserIds = []
    cycleModalOpen.value = true
}
const openEditCycle = (row: any) => {
    editingCycle.value = row
    cycleForm.paymentDate = new Date(row.paymentDate).toISOString().slice(0, 10)
    cycleForm.periodStart = new Date(row.periodStart).toISOString().slice(0, 10)
    cycleForm.periodEnd = new Date(row.periodEnd).toISOString().slice(0, 10)
    cycleForm.includeUserIds = row.includeUserIds ?? []
    cycleForm.excludeUserIds = row.excludeUserIds ?? []
    cycleModalOpen.value = true
}
const submitCycle = async () => {
    isRunningCycle.value = true
    try {
        const { month, year } = cycleMonthYearFromStart()
        await $fetch('/api/salary/payroll/run', {
            method: 'POST',
            body: {
                ...(editingCycle.value && { cycleId: editingCycle.value.id }),
                name: cycleNameFromPeriod(),
                month,
                year,
                paymentDate: cycleForm.paymentDate,
                periodStart: cycleForm.periodStart,
                periodEnd: cycleForm.periodEnd,
                includeUserIds: cycleForm.includeUserIds,
                excludeUserIds: cycleForm.excludeUserIds,
            },
        })
        toast.add({ title: editingCycle.value ? 'Cycle recalculated' : 'Cycle created', color: 'green' })
        cycleModalOpen.value = false
        await refetchCycles()
    } catch (err: any) {
        toast.add({ title: 'Could not run payroll', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isRunningCycle.value = false
    }
}
const rerunCycle = async (row: any) => {
    isRunningCycle.value = true
    try {
        const periodStart = new Date(row.periodStart)
        await $fetch('/api/salary/payroll/run', {
            method: 'POST',
            body: {
                cycleId: row.id,
                name: row.name,
                month: periodStart.getMonth() + 1,
                year: periodStart.getFullYear(),
                paymentDate: new Date(row.paymentDate).toISOString().slice(0, 10),
                periodStart: new Date(row.periodStart).toISOString().slice(0, 10),
                periodEnd: new Date(row.periodEnd).toISOString().slice(0, 10),
                includeUserIds: row.includeUserIds ?? [],
                excludeUserIds: row.excludeUserIds ?? [],
            },
        })
        toast.add({ title: 'Recalculated', color: 'green' })
        await refetchCycles()
    } catch (err: any) {
        toast.add({ title: 'Could not recalculate', description: err?.message, color: 'red' })
    } finally {
        isRunningCycle.value = false
    }
}
const deleteCycle = async (row: any) => {
    try {
        await $fetch(`/api/salary/payroll/cycle/${row.id}`, { method: 'DELETE' })
        toast.add({ title: 'Cycle deleted', color: 'green' })
        await refetchCycles()
    } catch (err: any) {
        toast.add({ title: 'Could not delete', description: err?.message, color: 'red' })
    }
}

// Full and final settlement
const fnfColumns = [
    { key: 'name', label: 'Staff' },
    { key: 'code', label: 'Code' },
    { key: 'phone', label: 'Phone' },
    { key: 'accrued', label: 'Accrued' },
    { key: 'paid', label: 'Paid' },
    { key: 'creditDue', label: 'Credit due' },
    { key: 'due', label: 'Net due' },
    { key: 'actions', label: '' },
]
const fnfRows = computed(() =>
    (activeUsers.value ?? []).map((u: any) => {
        const due = dues.value[u.userId] ?? {}
        return {
            ...u,
            accrued: Number(due.accrued ?? 0),
            paid: Number(due.paid ?? 0),
            creditDue: Number(due.creditDue ?? 0),
            due: Number(due.due ?? 0),
        }
    }),
)
const fnfModalOpen = ref(false)
const fnfUser = ref<any>(null)
const isSettlingFnf = ref(false)
const fnfForm = reactive({
    amount: 0,
    payMode: 'CASH:__primary__',
    date: todayKey,
    note: '',
})
const fnfActionLabel = computed(() => {
    const due = Number(fnfUser.value?.due ?? 0)
    if (due > 0.009) return 'Pay salary and deactivate'
    if (due < -0.009) return 'Receive credit and deactivate'
    return 'Deactivate'
})
const openFnf = (row: any) => {
    fnfUser.value = row
    fnfForm.amount = Math.abs(Number(row.due ?? 0))
    fnfForm.payMode = 'CASH:__primary__'
    fnfForm.date = todayKey
    fnfForm.note = `Full and final settlement - ${row.name || row.user?.email || row.userId}`
    fnfModalOpen.value = true
}
const submitFnf = async () => {
    if (!fnfUser.value) return
    const due = Number(fnfUser.value.due ?? 0)
    if (Math.abs(due) > 0.009 && (!fnfForm.amount || fnfForm.amount <= 0)) {
        return toast.add({ title: 'Enter a settlement amount', color: 'red' })
    }
    isSettlingFnf.value = true
    try {
        const { paymentMode, bankAccountId } = splitPayMode(fnfForm.payMode)
        const res: any = await $fetch('/api/salary/final-settlement', {
            method: 'POST',
            body: {
                userId: fnfUser.value.userId,
                amount: Number(fnfForm.amount || 0),
                paymentMode,
                bankAccountId,
                settlementDate: fnfForm.date,
                note: fnfForm.note || null,
            },
        })
        toast.add({
            title: 'F & F settled',
            description: `${res.settlementType === 'CREDIT_BILL_PAYMENT' ? 'Credit received' : res.settlementType === 'SALARY_PAYMENT' ? 'Salary paid' : 'No due'} · user deactivated`,
            color: 'green',
        })
        fnfModalOpen.value = false
        await Promise.all([refreshDues(), refetchActiveUsers(), refetchPayments()])
    } catch (err: any) {
        toast.add({ title: 'Could not settle F & F', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isSettlingFnf.value = false
    }
}

// Clear payment modal
const clearModalOpen = ref(false)
const clearingCycle = ref<any>(null)
const clearPayMode = ref('CASH:__primary__')
const isClearing = ref(false)
const openClear = (row: any) => {
    clearingCycle.value = row
    clearPayMode.value = 'CASH:__primary__'
    clearModalOpen.value = true
}
const submitClear = async () => {
    if (!clearingCycle.value) return
    isClearing.value = true
    try {
        const { paymentMode, bankAccountId } = splitPayMode(clearPayMode.value)
        const res: any = await $fetch('/api/salary/clear-cycle', {
            method: 'POST',
            body: { cycleId: clearingCycle.value.id, paymentMode, bankAccountId },
        })
        toast.add({ title: `Paid ${res.paidUsers} staff · ${money(res.paidTotal)}`, color: 'green' })
        clearModalOpen.value = false
        await Promise.all([refetchCycles(), refreshDues(), refetchPayments()])
    } catch (err: any) {
        toast.add({ title: 'Could not clear', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isClearing.value = false
    }
}

const cycleActions = (row: any) => [
    [
        { label: 'View details', icon: 'i-heroicons-eye', click: () => navigateTo(`/users/salary/cycle/${row.id}`) },
        { label: 'Re-run', icon: 'i-heroicons-arrow-path', click: () => rerunCycle(row) },
        { label: 'Edit', icon: 'i-heroicons-pencil-square', click: () => openEditCycle(row) },
    ],
    [
        { label: 'Clear payment', icon: 'i-heroicons-banknotes', click: () => openClear(row) },
    ],
    [
        { label: 'Delete', icon: 'i-heroicons-trash', click: () => deleteCycle(row) },
    ],
]

const cycleStatusColor = (s: string) => (s === 'PAID' ? 'green' : s === 'CALCULATED' ? 'blue' : 'gray')
const dueColor = (due: number) => (due > 0.009 ? 'red' : due < -0.009 ? 'green' : 'gray')
</script>

<template>
    <NuxtPage v-if="isCycleDetailRoute" />
    <UDashboardPanelContent v-else class="p-4">
        <div class="mb-4">
            <h1 class="text-xl font-bold">Salary</h1>
            <p class="text-sm text-gray-500">Pay staff, configure salaries, adjustments, and run payroll.</p>
        </div>

        <UTabs v-model="activeTab" :items="tabs" class="w-full">
            <template #item="{ item, index }">
                <!-- ══════════ PAY ══════════ -->
                <div v-if="index === 0" class="pt-4 space-y-4">
                    <UCard :ui="{ header: { padding: 'px-4 py-3' } }">
                        <template #header><h3 class="text-base font-semibold">Pay a staff member</h3></template>
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <UFormGroup label="Staff" required>
                                <USelectMenu v-model="payForm.userId" :options="staffOptions" value-attribute="id" option-attribute="label" searchable placeholder="Select staff" />
                            </UFormGroup>
                            <UFormGroup label="Amount" required>
                                <UInput v-model.number="payForm.amount" type="number" min="0" placeholder="0.00">
                                    <template #trailing><span class="text-xs text-gray-400">₹</span></template>
                                </UInput>
                            </UFormGroup>
                            <UFormGroup label="Type">
                                <USelect v-model="payForm.type" :options="payTypeOptions" />
                            </UFormGroup>
                            <UFormGroup label="Pay from">
                                <USelect v-model="payForm.payMode" :options="payModeOptions" value-attribute="value" option-attribute="label" />
                            </UFormGroup>
                            <UFormGroup label="Date">
                                <UInput v-model="payForm.date" type="date" />
                            </UFormGroup>
                            <UFormGroup label="Note">
                                <UInput v-model="payForm.note" placeholder="Optional" />
                            </UFormGroup>
                        </div>
                        <div class="mt-3 flex items-center justify-between">
                            <span v-if="payForm.userId" class="text-sm" :class="`text-${dueColor(selectedDue || 0)}-600`">
                                Current due: <strong>{{ money(selectedDue) }}</strong>
                                <span v-if="selectedCreditBills" class="ml-2 text-gray-500">Credit due: {{ money(selectedCreditBills) }}</span>
                                <span class="text-gray-400">{{ (selectedDue || 0) < 0 ? '(overpaid)' : '' }}</span>
                            </span>
                            <span v-else />
                            <UButton :loading="isPaying" icon="i-heroicons-banknotes" label="Record payment" @click="submitPay" />
                        </div>
                    </UCard>

                    <UCard :ui="{ header: { padding: 'px-4 py-3' }, body: { padding: '' } }">
                        <template #header>
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <h3 class="text-base font-semibold">Recent payments</h3>
                                <div class="flex gap-2">
                                    <USelectMenu v-model="payFilterUser" :options="staffOptions" value-attribute="id" option-attribute="label" searchable placeholder="All staff" size="xs" class="w-40" />
                                    <USelect v-model="payFilterType" :options="payTypeOptions" placeholder="All types" size="xs" class="w-28" />
                                    <UButton v-if="payFilterUser || payFilterType" color="gray" variant="ghost" size="xs" icon="i-heroicons-x-mark" @click="payFilterUser = null; payFilterType = null" />
                                </div>
                            </div>
                        </template>
                        <UTable :rows="payments || []" :columns="paymentColumns" :loading="paymentsLoading">
                            <template #date-data="{ row }">{{ fmtDate(row.paymentDate) }}</template>
                            <template #user-data="{ row }">{{ row.user?.name || staffName(row.userId) }}</template>
                            <template #type-data="{ row }"><UBadge :color="row.type === 'ADVANCE' ? 'orange' : row.type === 'CREDIT' ? 'blue' : 'green'" variant="subtle" size="xs">{{ row.type }}</UBadge></template>
                            <template #mode-data="{ row }"><span class="text-xs">{{ row.paymentMode }}</span></template>
                            <template #amount-data="{ row }"><span class="font-medium">{{ money(row.amount) }}</span></template>
                            <template #note-data="{ row }"><span class="text-xs text-gray-500">{{ row.note || '—' }}</span></template>
                            <template #actions-data="{ row }">
                                <div class="flex items-center gap-1">
                                    <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-pencil-square" @click="openEditPayment(row)" />
                                    <UButton color="red" variant="ghost" size="xs" icon="i-heroicons-trash" @click="deletePaymentRow(row)" />
                                </div>
                            </template>
                            <template #empty-state><div class="py-8 text-center text-sm text-gray-500">No payments yet.</div></template>
                        </UTable>
                    </UCard>
                </div>

                <!-- ══════════ SETTINGS ══════════ -->
                <div v-else-if="index === 1" class="pt-4">
                    <UCard :ui="{ body: { padding: '' } }">
                        <UTable :rows="settingsRows" :columns="settingsColumns" :loading="configsLoading">
                            <template #name-data="{ row }"><span class="font-medium">{{ row.name }}</span></template>
                            <template #period-data="{ row }"><UBadge v-if="row.config" color="gray" variant="subtle" size="xs">{{ row.config.period }}</UBadge><span v-else class="text-xs text-gray-400">not set</span></template>
                            <template #amount-data="{ row }">{{ row.config ? money(row.config.amount) : '—' }}</template>
                            <template #commission-data="{ row }">
                                <span v-if="row.config" class="font-mono text-xs">{{ Number(row.config.commissionPercentage ?? 0) }}%</span>
                                <span v-else class="text-xs text-gray-400">-</span>
                            </template>
                            <template #actions-data="{ row }">
                                <UButton :label="row.config ? 'Edit' : 'Set'" color="gray" variant="soft" size="xs" icon="i-heroicons-cog-6-tooth" @click="openConfig(row)" />
                            </template>
                            <template #empty-state><div class="py-8 text-center text-sm text-gray-500">No shift-assigned staff. Assign shifts first.</div></template>
                        </UTable>
                    </UCard>
                </div>

                <!-- ══════════ ADJUSTMENTS ══════════ -->
                <div v-else-if="index === 2" class="pt-4 space-y-4">
                    <UCard :ui="{ header: { padding: 'px-4 py-3' } }">
                        <template #header><h3 class="text-base font-semibold">Add adjustment</h3></template>
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
                            <UFormGroup label="Staff" required>
                                <USelectMenu v-model="adjForm.userId" :options="staffOptions" value-attribute="id" option-attribute="label" searchable placeholder="Staff" />
                            </UFormGroup>
                            <UFormGroup label="Type">
                                <USelect v-model="adjForm.kind" :options="['ADDITION', 'DEDUCTION']" />
                            </UFormGroup>
                            <UFormGroup label="Label" required>
                                <USelectMenu v-model="adjForm.label" :options="adjustmentLabelOptions" searchable placeholder="Select label" />
                            </UFormGroup>
                            <UFormGroup label="Amount" required>
                                <UInput v-model.number="adjForm.amount" type="number" min="0" placeholder="0.00" />
                            </UFormGroup>
                            <UFormGroup label="Month">
                                <USelect v-model="adjForm.month" :options="months" value-attribute="value" option-attribute="label" />
                            </UFormGroup>
                            <UFormGroup label="Year">
                                <USelect v-model="adjForm.year" :options="years" />
                            </UFormGroup>
                            <UFormGroup label="Reason" class="md:col-span-2">
                                <UInput v-model="adjForm.reason" placeholder="Optional note" />
                            </UFormGroup>
                            <div class="flex items-end">
                                <UButton :loading="isSavingAdj" icon="i-heroicons-plus" label="Add" @click="submitAdj" />
                            </div>
                        </div>
                    </UCard>

                    <UCard :ui="{ header: { padding: 'px-4 py-3' }, body: { padding: '' } }">
                        <template #header>
                            <div class="flex items-center justify-between">
                                <h3 class="text-base font-semibold">{{ showAdjHistory ? 'History' : 'Pending' }} adjustments</h3>
                                <UButton :label="showAdjHistory ? 'Show pending' : 'Show history'" color="gray" variant="soft" size="xs" @click="showAdjHistory = !showAdjHistory" />
                            </div>
                        </template>
                        <UTable :rows="adjustments || []" :columns="adjColumns" :loading="adjLoading">
                            <template #user-data="{ row }">{{ row.user?.name || staffName(row.userId) }}</template>
                            <template #kind-data="{ row }"><UBadge :color="row.kind === 'ADDITION' ? 'green' : 'red'" variant="subtle" size="xs">{{ row.kind === 'ADDITION' ? '+ Add' : '− Deduct' }}</UBadge></template>
                            <template #label-data="{ row }"><span class="text-sm">{{ row.label }}</span><div v-if="row.reason" class="text-[11px] text-gray-400">{{ row.reason }}</div></template>
                            <template #amount-data="{ row }">{{ money(row.amount) }}</template>
                            <template #period-data="{ row }">{{ row.month }}/{{ row.year }}</template>
                            <template #status-data="{ row }"><UBadge :color="row.status === 'PROCESSED' ? 'green' : row.status === 'CANCELLED' ? 'gray' : 'amber'" variant="subtle" size="xs">{{ row.status }}</UBadge></template>
                            <template #actions-data="{ row }">
                                <div @click.stop><UDropdown :items="adjActions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" size="xs" /></UDropdown></div>
                            </template>
                            <template #empty-state><div class="py-8 text-center text-sm text-gray-500">No adjustments.</div></template>
                        </UTable>
                    </UCard>
                </div>

                <!-- ══════════ RUN PAYROLL ══════════ -->
                <div v-else-if="index === 3" class="pt-4 space-y-4">
                    <div class="flex justify-end">
                        <UButton icon="i-heroicons-plus" label="Create new cycle" @click="openCreateCycle" />
                    </div>
                    <UCard :ui="{ body: { padding: '' } }">
                        <UTable :rows="cycles || []" :columns="cycleColumns" :loading="cyclesLoading">
                            <template #period-data="{ row }"><span class="font-medium">{{ row.name || `${row.month}/${row.year}` }}</span></template>
                            <template #dates-data="{ row }"><span class="text-xs">{{ fmtDate(row.periodStart) }} – {{ fmtDate(row.periodEnd) }}</span></template>
                            <template #paymentDate-data="{ row }"><span class="text-xs">{{ fmtDate(row.paymentDate) }}</span></template>
                            <template #users-data="{ row }"><UBadge color="gray" variant="subtle" size="xs">{{ row._count?.lines ?? 0 }}</UBadge></template>
                            <template #totalNet-data="{ row }"><span class="font-medium">{{ money(row.totalNet) }}</span></template>
                            <template #status-data="{ row }"><UBadge :color="cycleStatusColor(row.status)" variant="subtle" size="xs">{{ row.status }}</UBadge></template>
                            <template #actions-data="{ row }">
                                <div @click.stop><UDropdown :items="cycleActions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" size="xs" /></UDropdown></div>
                            </template>
                            <template #empty-state><div class="py-8 text-center text-sm text-gray-500">No payroll cycles yet.</div></template>
                        </UTable>
                    </UCard>
                </div>

                <div v-else-if="index === 4" class="pt-4">
                    <UCard :ui="{ body: { padding: '' } }">
                        <UTable :rows="fnfRows" :columns="fnfColumns" :loading="fnfLoading">
                            <template #name-data="{ row }">
                                <div>
                                    <div class="font-medium">{{ row.name || row.user?.email || row.userId }}</div>
                                    <div class="text-xs text-gray-500">{{ row.user?.email || '—' }}</div>
                                </div>
                            </template>
                            <template #code-data="{ row }"><span class="font-mono text-xs">{{ row.code || '—' }}</span></template>
                            <template #phone-data="{ row }"><span class="text-xs">{{ row.phone || '—' }}</span></template>
                            <template #accrued-data="{ row }">{{ money(row.accrued) }}</template>
                            <template #paid-data="{ row }">{{ money(row.paid) }}</template>
                            <template #creditDue-data="{ row }">{{ money(row.creditDue) }}</template>
                            <template #due-data="{ row }">
                                <UBadge :color="dueColor(row.due)" variant="subtle" size="xs">{{ money(row.due) }}</UBadge>
                            </template>
                            <template #actions-data="{ row }">
                                <UButton size="xs" color="gray" variant="soft" icon="i-heroicons-check-circle" label="Settle" @click="openFnf(row)" />
                            </template>
                            <template #empty-state><div class="py-8 text-center text-sm text-gray-500">No active staff to settle.</div></template>
                        </UTable>
                    </UCard>
                </div>
            </template>
        </UTabs>

        <!-- ─── Salary config modal ─── -->
        <UModal v-model="paymentEditOpen" :ui="{ width: 'sm:max-w-xl' }">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">Edit payment</h3></template>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <UFormGroup label="Staff" required>
                        <USelectMenu v-model="paymentEditForm.userId" :options="staffOptions" value-attribute="id" option-attribute="label" searchable placeholder="Select staff" />
                    </UFormGroup>
                    <UFormGroup label="Amount" required>
                        <UInput v-model.number="paymentEditForm.amount" type="number" min="0" placeholder="0.00" />
                    </UFormGroup>
                    <UFormGroup label="Type">
                        <USelect v-model="paymentEditForm.type" :options="payTypeOptions" />
                    </UFormGroup>
                    <UFormGroup label="Pay from">
                        <USelect v-model="paymentEditForm.payMode" :options="payModeOptions" value-attribute="value" option-attribute="label" />
                    </UFormGroup>
                    <UFormGroup label="Date">
                        <UInput v-model="paymentEditForm.date" type="date" />
                    </UFormGroup>
                    <UFormGroup label="Note">
                        <UInput v-model="paymentEditForm.note" placeholder="Optional" />
                    </UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="paymentEditOpen = false" />
                        <UButton :loading="isEditingPayment" label="Update" @click="submitEditPayment" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Salary config modal ─── -->
        <UModal v-model="configModalOpen" :ui="{ width: 'sm:max-w-xl' }">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">Salary settings — {{ staffName(configForm.userId) }}</h3></template>
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Salary period"><USelect v-model="configForm.period" :options="periodOptions" /></UFormGroup>
                        <UFormGroup label="Salary amount" hint="for the chosen period"><UInput v-model.number="configForm.amount" type="number" min="0" /></UFormGroup>
                        <UFormGroup label="Commission %" hint="on net user sales in cycle period">
                            <UInput v-model.number="configForm.commissionPercentage" type="number" min="0" step="0.01" />
                        </UFormGroup>
                    </div>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="configModalOpen = false" />
                        <UButton :loading="isSavingConfig" label="Save" @click="submitConfig" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Create / edit cycle modal ─── -->
        <UModal v-model="fnfModalOpen" :ui="{ width: 'sm:max-w-xl' }">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header>
                    <h3 class="text-base font-semibold">F & F — {{ fnfUser?.name || fnfUser?.user?.email || fnfUser?.userId }}</h3>
                </template>
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-3 rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                        <div>
                            <div class="text-xs text-gray-500">Net due</div>
                            <div class="font-semibold" :class="`text-${dueColor(fnfUser?.due || 0)}-600`">{{ money(fnfUser?.due || 0) }}</div>
                        </div>
                        <div>
                            <div class="text-xs text-gray-500">Action</div>
                            <div class="font-medium">{{ fnfActionLabel }}</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <UFormGroup label="Settlement amount" required>
                            <UInput v-model.number="fnfForm.amount" type="number" min="0" step="0.01" />
                        </UFormGroup>
                        <UFormGroup label="Date">
                            <UInput v-model="fnfForm.date" type="date" />
                        </UFormGroup>
                        <UFormGroup label="Payment account">
                            <USelect v-model="fnfForm.payMode" :options="payModeOptions" value-attribute="value" option-attribute="label" />
                        </UFormGroup>
                        <UFormGroup label="Note">
                            <UInput v-model="fnfForm.note" placeholder="Optional" />
                        </UFormGroup>
                    </div>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="fnfModalOpen = false" />
                        <UButton color="green" :loading="isSettlingFnf" :label="fnfActionLabel" @click="submitFnf" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <UModal v-model="cycleModalOpen" :ui="{ width: 'sm:max-w-xl' }">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">{{ editingCycle ? 'Edit & recalculate cycle' : 'Create new cycle' }}</h3></template>
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Pay period start"><UInput v-model="cycleForm.periodStart" type="date" /></UFormGroup>
                        <UFormGroup label="Pay period end"><UInput v-model="cycleForm.periodEnd" type="date" /></UFormGroup>
                    </div>
                    <UFormGroup label="Payment date"><UInput v-model="cycleForm.paymentDate" type="date" /></UFormGroup>
                    <UFormGroup label="Include only" hint="leave empty for all shift-assigned staff">
                        <USelectMenu v-model="cycleForm.includeUserIds" :options="staffOptions" value-attribute="id" option-attribute="label" multiple searchable placeholder="All staff" />
                    </UFormGroup>
                    <UFormGroup label="Exclude">
                        <USelectMenu v-model="cycleForm.excludeUserIds" :options="staffOptions" value-attribute="id" option-attribute="label" multiple searchable placeholder="None" />
                    </UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="cycleModalOpen = false" />
                        <UButton :loading="isRunningCycle" :label="editingCycle ? 'Save & recalculate' : 'Create'" @click="submitCycle" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Clear payment modal ─── -->
        <UModal v-model="clearModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">Clear payment — {{ clearingCycle?.name }}</h3></template>
                <div class="space-y-3">
                    <p class="text-sm text-gray-600 dark:text-gray-300">Pays each staff member their outstanding net for this cycle as salary.</p>
                    <UFormGroup label="Pay from">
                        <USelect v-model="clearPayMode" :options="payModeOptions" value-attribute="value" option-attribute="label" />
                    </UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="clearModalOpen = false" />
                        <UButton color="green" :loading="isClearing" label="Pay all" @click="submitClear" />
                    </div>
                </template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>

