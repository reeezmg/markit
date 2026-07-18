<script setup lang="ts">
import {
    useFindManyBankAccount,
} from '~/lib/hooks'

const route = useRoute()
const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = computed(() => useAuth().session.value?.companyId)
const cycleId = computed(() => route.params.id as string)

const money = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—')
const num = (v: any) => Number(v ?? 0)

const {
    data: cycleDetail,
    pending: isLoading,
    refresh: refetchCycle,
} = await useFetch(() => `/api/salary/payroll/cycle/${cycleId.value}`)

const cycle = computed(() => (cycleDetail.value as any)?.cycle ?? null)

// payments tied to this cycle (to compute per-line paid)
const cyclePayments = computed(() => (cycleDetail.value as any)?.payments ?? [])
const cycleCreditCuts = computed(() => (cycleDetail.value as any)?.creditCuts ?? [])
const cycleCreditDues = computed(() => (cycleDetail.value as any)?.creditDues ?? [])
const cycleCarryForwards = computed(() => (cycleDetail.value as any)?.carryForwards ?? [])
const paidByLine = computed(() => {
    const m: Record<string, number> = {}
    for (const p of cyclePayments.value ?? []) {
        if (!p.cycleLineId) continue
        m[p.cycleLineId] = (m[p.cycleLineId] ?? 0) + num(p.amount)
    }
    return m
})
const creditCutByLine = computed(() => {
    const m: Record<string, number> = {}
    for (const p of cycleCreditCuts.value ?? []) {
        if (!p.cycleLineId) continue
        m[p.cycleLineId] = (m[p.cycleLineId] ?? 0) + num(p.amount)
    }
    return m
})
const creditDueByUser = computed(() => {
    const m: Record<string, number> = {}
    for (const p of cycleCreditDues.value ?? []) {
        if (!p.userId) continue
        m[p.userId] = num(p.due)
    }
    return m
})
const carryForwardByUser = computed(() => {
    const m: Record<string, number> = {}
    for (const p of cycleCarryForwards.value ?? []) {
        if (!p.userId) continue
        m[p.userId] = num(p.amount)
    }
    return m
})

const lines = computed(() =>
    [...(cycle.value?.lines ?? [])]
        .map((l: any) => {
            const paid = paidByLine.value[l.id] ?? 0
            const creditCut = creditCutByLine.value[l.id] ?? 0
            const creditDue = Math.max(0, creditDueByUser.value[l.userId] ?? 0)
            const carryForward = carryForwardByUser.value[l.userId] ?? 0
            const outstanding = carryForward + num(l.netPay) - paid - creditCut
            return { ...l, paid, creditCut, creditDue, carryForward, outstanding }
        })
        .sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || '')),
)

const totals = computed(() => {
    const carryForward = lines.value.reduce((s, l) => s + l.carryForward, 0)
    const acc = lines.value.reduce((s, l) => s + num(l.netPay), 0)
    const paid = lines.value.reduce((s, l) => s + l.paid, 0)
    const creditCut = lines.value.reduce((s, l) => s + l.creditCut, 0)
    return { carryForward, accrued: acc, paid, creditCut, outstanding: carryForward + acc - paid - creditCut }
})

const columns = [
    { key: 'name', label: 'Staff' },
    { key: 'base', label: 'Base' },
    { key: 'days', label: 'P/A/H' },
    { key: 'leave', label: 'Leave' },
    { key: 'fines', label: 'Late/Early' },
    { key: 'ot', label: 'OT' },
    { key: 'commission', label: 'Comm.' },
    { key: 'adj', label: 'Adj.' },
    { key: 'carry', label: 'Prev.' },
    { key: 'net', label: 'Net' },
    { key: 'paid', label: 'Paid' },
    { key: 'credit', label: 'Credit' },
    { key: 'outstanding', label: 'Due' },
    { key: 'actions', label: '' },
]

// ─── Bank/cash options ───
const { data: bankAccounts } = useFindManyBankAccount(
    computed(() => ({ where: { companyId: companyId.value } })),
)
const payModeOptions = computed(() => [
    { label: 'Cash', value: 'CASH:__primary__' },
    { label: 'Bank (Primary)', value: 'BANK:__primary__' },
    ...(bankAccounts.value ?? []).map((b: any) => ({ label: `Bank · ${b.bankName || 'Bank'} ${b.accountNo || ''}`.trim(), value: `BANK:${b.id}` })),
])
function splitPayMode(v: string) {
    const [mode, acc] = v.split(':')
    return { paymentMode: mode as 'CASH' | 'BANK', bankAccountId: acc === '__primary__' ? null : acc }
}

// ─── Pay one line (clear / partial) ───
const payModalOpen = ref(false)
const payLine = ref<any>(null)
const payAmount = ref<number>(0)
const creditCutMode = ref<'PERCENT' | 'AMOUNT'>('PERCENT')
const creditCutPercent = ref<number>(100)
const creditCutAmount = ref<number>(0)
const payMode = ref('CASH:__primary__')
const isPaying = ref(false)
const maxCreditCut = computed(() => Math.min(num(payLine.value?.creditDue), Math.max(0, num(payLine.value?.outstanding))))
const modalOutstandingAfterCredit = computed(() => Math.max(0, num(payLine.value?.outstanding) - num(creditCutAmount.value)))

const clampCreditCut = (value: number) => Math.min(maxCreditCut.value, Math.max(0, num(value)))
const syncCreditCutFromPercent = () => {
    creditCutAmount.value = clampCreditCut(maxCreditCut.value * (Math.max(0, Math.min(100, num(creditCutPercent.value))) / 100))
    payAmount.value = modalOutstandingAfterCredit.value
}
const syncCreditCutFromAmount = () => {
    creditCutAmount.value = clampCreditCut(creditCutAmount.value)
    payAmount.value = modalOutstandingAfterCredit.value
}

const openPay = (line: any) => {
    payLine.value = line
    creditCutMode.value = 'PERCENT'
    creditCutPercent.value = 100
    creditCutAmount.value = clampCreditCut(line.creditDue)
    payAmount.value = Math.max(0, num(line.outstanding) - creditCutAmount.value)
    payMode.value = 'CASH:__primary__'
    payModalOpen.value = true
}
const submitPay = async () => {
    const salaryAmount = Math.max(0, num(payAmount.value))
    const creditAmount = clampCreditCut(creditCutAmount.value)
    if (!payLine.value || (salaryAmount <= 0 && creditAmount <= 0)) return toast.add({ title: 'Enter an amount', color: 'red' })
    if (salaryAmount + creditAmount > Math.max(0, num(payLine.value.outstanding)) + 0.009) {
        return toast.add({ title: 'Amount is more than outstanding', color: 'red' })
    }
    isPaying.value = true
    try {
        const { paymentMode, bankAccountId } = splitPayMode(payMode.value)
        await $fetch('/api/salary/pay-with-credit', {
            method: 'POST',
            body: {
                userId: payLine.value.userId,
                salaryAmount,
                creditCutAmount: creditAmount,
                paymentMode,
                bankAccountId,
                note: `Payroll ${cycle.value?.month}/${cycle.value?.year}`,
                cycleId: cycleId.value,
                cycleLineId: payLine.value.id,
            },
        })
        toast.add({ title: 'Payment recorded', color: 'green' })
        payModalOpen.value = false
        await refetchCycle()
    } catch (err: any) {
        toast.add({ title: 'Payment failed', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isPaying.value = false
    }
}

watch(creditCutPercent, () => {
    if (creditCutMode.value === 'PERCENT') syncCreditCutFromPercent()
})
watch(creditCutAmount, () => {
    if (creditCutMode.value === 'AMOUNT') syncCreditCutFromAmount()
})

// ─── Clear all ───
const clearAllOpen = ref(false)
const clearMode = ref('CASH:__primary__')
const isClearing = ref(false)
const submitClearAll = async () => {
    isClearing.value = true
    try {
        const { paymentMode, bankAccountId } = splitPayMode(clearMode.value)
        const res: any = await $fetch('/api/salary/clear-cycle', {
            method: 'POST',
            body: { cycleId: cycleId.value, paymentMode, bankAccountId },
        })
        toast.add({ title: `Paid ${res.paidUsers} staff · ${money(res.paidTotal)}`, color: 'green' })
        clearAllOpen.value = false
        await refetchCycle()
    } catch (err: any) {
        toast.add({ title: 'Could not clear', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isClearing.value = false
    }
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="mb-4 flex items-start justify-between gap-3">
            <div>
                <div class="flex items-center gap-2">
                    <UButton icon="i-heroicons-arrow-left" color="gray" variant="ghost" size="xs" @click="navigateTo('/users/salary')" />
                    <h1 class="text-xl font-bold">{{ cycle?.name || 'Payroll cycle' }}</h1>
                    <UBadge v-if="cycle" :color="cycle.status === 'PAID' ? 'green' : cycle.status === 'CALCULATED' ? 'blue' : 'gray'" variant="subtle" size="xs">{{ cycle.status }}</UBadge>
                </div>
                <p v-if="cycle" class="text-sm text-gray-500">
                    {{ fmtDate(cycle.periodStart) }} – {{ fmtDate(cycle.periodEnd) }} · pay {{ fmtDate(cycle.paymentDate) }}
                </p>
            </div>
            <UButton icon="i-heroicons-banknotes" label="Clear all" :disabled="totals.outstanding <= 0" @click="clearAllOpen = true" />
        </div>

        <div class="mb-4 grid grid-cols-5 gap-3">
            <UCard :ui="{ body: { padding: 'p-3' } }"><div class="text-xs uppercase text-gray-500">Previous due</div><div class="mt-1 text-lg font-bold" :class="totals.carryForward > 0 ? 'text-red-600' : totals.carryForward < 0 ? 'text-green-600' : 'text-gray-500'">{{ money(totals.carryForward) }}</div></UCard>
            <UCard :ui="{ body: { padding: 'p-3' } }"><div class="text-xs uppercase text-gray-500">Accrued (owed)</div><div class="mt-1 text-lg font-bold">{{ money(totals.accrued) }}</div></UCard>
            <UCard :ui="{ body: { padding: 'p-3' } }"><div class="text-xs uppercase text-gray-500">Paid</div><div class="mt-1 text-lg font-bold text-green-600">{{ money(totals.paid) }}</div></UCard>
            <UCard :ui="{ body: { padding: 'p-3' } }"><div class="text-xs uppercase text-gray-500">Credit cut</div><div class="mt-1 text-lg font-bold text-sky-600">{{ money(totals.creditCut) }}</div></UCard>
            <UCard :ui="{ body: { padding: 'p-3' } }"><div class="text-xs uppercase text-gray-500">Outstanding</div><div class="mt-1 text-lg font-bold" :class="totals.outstanding > 0 ? 'text-red-600' : totals.outstanding < 0 ? 'text-green-600' : 'text-gray-500'">{{ money(totals.outstanding) }}</div></UCard>
        </div>

        <UCard :ui="{ body: { padding: '' } }">
            <UTable
                :rows="lines"
                :columns="columns"
                :loading="isLoading"
                class="text-[10px]"
                :ui="{
                    th: { base: 'text-[10px] px-1.5 py-1.5 whitespace-nowrap' },
                    td: { base: 'text-[10px] px-1.5 py-1.5 whitespace-nowrap' },
                }"
            >
                <template #name-data="{ row }"><span class="font-medium">{{ row.user?.name || row.userId }}</span></template>
                <template #base-data="{ row }">{{ money(row.baseSalary) }}</template>
                <template #days-data="{ row }"><span class="font-mono text-[10px]">{{ row.presentDays }} / {{ row.absentDays }} / {{ row.halfDays }}</span></template>
                <template #fines-data="{ row }">
                    <div v-if="num(row.lateEntryFine) || num(row.earlyExitFine)" class="space-y-0.5 text-[10px] text-red-500">
                        <div v-if="num(row.lateEntryFine)">Late: -{{ money(row.lateEntryFine) }}</div>
                        <div v-if="num(row.earlyExitFine)">Early: -{{ money(row.earlyExitFine) }}</div>
                    </div>
                    <span v-else class="text-gray-400">-</span>
                </template>
                <template #leave-data="{ row }"><span class="text-red-500">{{ row.leaveDeduction > 0 ? '−' + money(row.leaveDeduction) : '—' }}</span></template>
                <template #ot-data="{ row }"><span v-if="row.overtimeAmount > 0" class="text-green-600">+{{ money(row.overtimeAmount) }}</span><span v-else class="text-gray-400">—</span><div v-if="row.overtimeHours" class="text-[9px] text-gray-400">{{ row.overtimeHours }}h</div></template>
                <template #commission-data="{ row }">
                    <span v-if="num(row.commissionAmount) > 0" class="text-green-600">+{{ money(row.commissionAmount) }}</span>
                    <span v-else class="text-gray-400">-</span>
                    <div v-if="num(row.commissionSales)" class="text-[9px] text-gray-400">sales {{ money(row.commissionSales) }}</div>
                </template>
                <template #adj-data="{ row }"><span :class="num(row.adjustmentTotal) < 0 ? 'text-red-500' : num(row.adjustmentTotal) > 0 ? 'text-green-600' : 'text-gray-400'">{{ num(row.adjustmentTotal) === 0 ? '—' : (num(row.adjustmentTotal) > 0 ? '+' : '−') + money(Math.abs(num(row.adjustmentTotal))) }}</span></template>
                <template #carry-data="{ row }">
                    <span :class="row.carryForward > 0 ? 'text-amber-600' : row.carryForward < 0 ? 'text-green-600' : 'text-gray-400'">
                        {{ row.carryForward === 0 ? '—' : money(row.carryForward) }}
                    </span>
                </template>
                <template #net-data="{ row }"><span class="font-semibold">{{ money(row.netPay) }}</span></template>
                <template #paid-data="{ row }"><span class="text-green-600">{{ money(row.paid) }}</span></template>
                <template #credit-data="{ row }">
                    <span :class="row.creditCut > 0 ? 'text-sky-600' : 'text-gray-400'">{{ row.creditCut > 0 ? '−' + money(row.creditCut) : '—' }}</span>
                    <div v-if="row.creditDue > 0" class="text-[9px] text-red-600">due {{ money(row.creditDue) }}</div>
                </template>
                <template #outstanding-data="{ row }"><span class="font-medium" :class="row.outstanding > 0 ? 'text-red-600' : row.outstanding < 0 ? 'text-green-600' : 'text-gray-400'">{{ money(row.outstanding) }}</span></template>
                <template #actions-data="{ row }">
                    <UButton v-if="row.outstanding > 0" color="green" variant="soft" size="2xs" icon="i-heroicons-banknotes" label="Pay" class="text-[10px]" @click="openPay(row)" />
                    <UBadge v-else color="green" variant="subtle" size="2xs">Paid</UBadge>
                </template>
                <template #empty-state><div class="py-8 text-center text-sm text-gray-500">No lines. Run the cycle from the Salary page.</div></template>
            </UTable>
        </UCard>

        <!-- ─── Pay line modal (clear / partial) ─── -->
        <UModal v-model="payModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">Pay {{ payLine?.user?.name }}</h3></template>
                <div class="space-y-3">
                    <p class="text-sm text-gray-500">Outstanding: <strong>{{ money(payLine?.outstanding) }}</strong></p>
                    <p v-if="payLine?.carryForward" class="text-xs" :class="payLine.carryForward > 0 ? 'text-amber-600' : 'text-green-600'">
                        Previous due: {{ money(payLine.carryForward) }}
                    </p>
                    <div class="grid grid-cols-2 gap-3">
                        <UFormGroup label="Credit cut">
                            <USelect
                                v-model="creditCutMode"
                                :options="[
                                    { label: 'Percentage', value: 'PERCENT' },
                                    { label: 'Amount', value: 'AMOUNT' },
                                ]"
                                value-attribute="value"
                                option-attribute="label"
                                @update:model-value="mode => mode === 'PERCENT' ? syncCreditCutFromPercent() : syncCreditCutFromAmount()"
                            />
                        </UFormGroup>
                        <UFormGroup v-if="creditCutMode === 'PERCENT'" label="Cut percent" :hint="`Available ${money(maxCreditCut)}`">
                            <UInput v-model.number="creditCutPercent" type="number" min="0" max="100" />
                        </UFormGroup>
                        <UFormGroup v-else label="Cut amount" :hint="`Available ${money(maxCreditCut)}`">
                            <UInput v-model.number="creditCutAmount" type="number" min="0" :max="maxCreditCut" />
                        </UFormGroup>
                    </div>
                    <p v-if="creditCutAmount > 0" class="text-sm text-sky-600">
                        Credit reduction: <strong>{{ money(creditCutAmount) }}</strong> · remaining salary {{ money(modalOutstandingAfterCredit) }}
                    </p>
                    <UFormGroup label="Amount" hint="reduce for a partial payment"><UInput v-model.number="payAmount" type="number" min="0" /></UFormGroup>
                    <UFormGroup label="Pay from"><USelect v-model="payMode" :options="payModeOptions" value-attribute="value" option-attribute="label" /></UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="payModalOpen = false" />
                        <UButton color="green" :loading="isPaying" label="Pay" @click="submitPay" />
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Clear all modal ─── -->
        <UModal v-model="clearAllOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">Clear all outstanding</h3></template>
                <div class="space-y-3">
                    <p class="text-sm text-gray-600 dark:text-gray-300">Pays every staff member's current outstanding including previous due ({{ money(totals.outstanding) }}) as salary.</p>
                    <UFormGroup label="Pay from"><USelect v-model="clearMode" :options="payModeOptions" value-attribute="value" option-attribute="label" /></UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="clearAllOpen = false" />
                        <UButton color="green" :loading="isClearing" label="Pay all" @click="submitClearAll" />
                    </div>
                </template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>


