<script setup lang="ts">
import { useFindManyCompanyUser } from '~/lib/company-hooks/company-user'
import { localDateKey } from '~/utils/shift-policy'
const scope = useCompanyScope('table')
const toast = useToast()
const today = localDateKey(new Date())
const from = ref(`${today.slice(0, 4)}-01-01`)
const to = ref(`${today.slice(0, 4)}-12-31`)
const canManage = computed(() => ['admin', 'manager', 'accountant'].includes(scope.auth.session.value?.role || ''))
const { data, pending, refresh } = await useAsyncData('staff-leave-applications', () => scope.fetch('/api/users/leaves', { query: { from: from.value, to: to.value } }), { watch: [from, to, scope.readIds] })
const { data: staff } = useFindManyCompanyUser(computed(() => ({ where: { companyId: scope.companyId.value, status: true, deleted: false }, include: { user: true } })), { companyScope: 'form' } as any)
const staffOptions = computed(() => (staff.value ?? []).map((s: any) => ({ value: s.userId, label: s.name || s.user?.email || s.userId })))
const types = [{ value: 'CASUAL', label: 'Casual leave' }, { value: 'SICK', label: 'Sick leave' }, { value: 'EARNED', label: 'Earned leave' }, { value: 'OTHER', label: 'Other leave' }, { value: 'COMP_OFF', label: 'Compensatory leave' }]
const columns = [{ key: 'staff', label: 'Staff' }, { key: 'type', label: 'Type' }, { key: 'dates', label: 'Dates' }, { key: 'days', label: 'Days' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' }, { key: 'actions', label: '' }]
const balanceUser = ref('')
const balanceDate = ref(today)
const balance = ref<any>(null)
const balanceError = ref('')
let balanceRequest = 0
watch(scope.companyId, () => { balanceUser.value = ''; balance.value = null })
watch([balanceUser, balanceDate, scope.companyId], async () => {
    const request = ++balanceRequest
    balance.value = null; balanceError.value = ''
    if (!balanceUser.value || !balanceDate.value) return
    try {
        const result = await scope.fetch('/api/users/leave-balances', { query: { userId: balanceUser.value, date: balanceDate.value } })
        if (request === balanceRequest) balance.value = result
    } catch (err: any) { if (request === balanceRequest) balanceError.value = err?.data?.statusMessage || err.message }
})
const open = ref(false), saving = ref(false)
const form = reactive({ id: '', userId: '', type: 'CASUAL', startDate: today, endDate: today, days: 1, reason: '', status: 'PENDING', decisionNote: '' })
async function edit(row?: any) {
    await scope.beginForm()
    if (row) await scope.selectOwner(row.companyId)
    Object.assign(form, { id: row?.id || '', userId: row?.userId || '', type: row?.type || 'CASUAL',
        startDate: row ? localDateKey(new Date(row.startDate)) : today, endDate: row ? localDateKey(new Date(row.endDate)) : today,
        days: row?.days ?? 1, reason: row?.reason || '', status: row?.status || 'PENDING', decisionNote: row?.decisionNote || '' })
    open.value = true
}
watch(scope.companyId, () => { if (open.value && !form.id) form.userId = '' })
async function save() {
    if (saving.value) return
    saving.value = true
    try {
        await scope.fetch(form.id ? `/api/users/leaves/${form.id}` : '/api/users/leaves', { method: form.id ? 'PUT' : 'POST', body: { ...form } })
        open.value = false; balance.value = null
        await refresh()
        toast.add({ title: 'Leave application saved', color: 'green' })
    } catch (err: any) { toast.add({ title: 'Could not save leave', description: err?.data?.statusMessage || err.message, color: 'red' }) }
    finally { saving.value = false }
}
</script>

<template>
    <UDashboardPanelContent class="p-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div><h1 class="text-xl font-bold">Leave applications</h1><p class="text-sm text-gray-500">Approved leave uses the shift policy effective on each leave date. Excess entitlement is unpaid.</p></div>
            <div class="flex gap-2"><UButton to="/users/shift" color="gray">Shifts</UButton><UButton to="/users/attendance" color="gray">Attendance</UButton><UButton v-if="canManage" @click="edit()">New application</UButton></div>
        </div>
        <CompanyTableFilter />
        <div class="flex gap-3"><UFormGroup label="From"><UInput v-model="from" type="date" /></UFormGroup><UFormGroup label="To"><UInput v-model="to" type="date" /></UFormGroup></div>
        <UTable :rows="data?.leaves || []" :columns="scope.columns(columns)" :loading="pending">
            <template #companyId-data="{ row }">{{ scope.companyName(row.companyId) }}</template>
            <template #staff-data="{ row }">{{ row.user?.name || row.user?.user?.email || row.userId }}</template>
            <template #dates-data="{ row }">{{ localDateKey(new Date(row.startDate)) }} – {{ localDateKey(new Date(row.endDate)) }}</template>
            <template #actions-data="{ row }"><UButton v-if="canManage" color="gray" variant="ghost" @click="edit(row)">Edit / decide</UButton></template>
        </UTable>
        <UCard>
            <template #header><h2 class="font-semibold">Leave balances</h2></template>
            <CompanyFormField />
            <div class="flex flex-wrap gap-3"><UFormGroup label="Staff"><USelectMenu v-model="balanceUser" :options="staffOptions" value-attribute="value" option-attribute="label" searchable /></UFormGroup><UFormGroup label="As of date"><UInput v-model="balanceDate" type="date" /></UFormGroup></div>
            <p v-if="balanceError" class="mt-3 text-red-500">{{ balanceError }}</p>
            <div v-if="balance" class="mt-4 space-y-2">
                <p v-if="!balance.typedLeaveEnabled" class="text-sm text-gray-500">This shift uses the generic paid-leave allowance. Type-specific balances below are not applied until enabled.</p>
                <div class="grid gap-3 sm:grid-cols-3">
                    <div v-for="(value, type) in balance.balances" :key="type" class="rounded border p-3 text-sm"><strong>{{ type }}</strong><div>{{ Math.max(0, value.allowance - value.used) }} remaining / {{ value.allowance }} {{ value.period.toLowerCase() }}</div></div>
                    <div class="rounded border p-3 text-sm"><strong>Compensatory leave</strong><div>{{ balance.compOffBalance }} days available</div></div>
                </div>
            </div>
        </UCard>
        <UModal v-model="open" :prevent-close="saving">
            <UCard><template #header><h2 class="font-semibold">{{ form.id ? 'Edit leave application' : 'New leave application' }}</h2></template>
                <form class="space-y-3" @submit.prevent="save">
                    <CompanyFormField :locked="!!form.id || saving" />
                    <UFormGroup label="Staff" required><USelectMenu v-model="form.userId" :options="staffOptions" value-attribute="value" option-attribute="label" searchable :disabled="!!form.id" /></UFormGroup>
                    <UFormGroup label="Leave type"><USelect v-model="form.type" :options="types" /></UFormGroup>
                    <div class="grid grid-cols-2 gap-3"><UFormGroup label="Start"><UInput v-model="form.startDate" type="date" required /></UFormGroup><UFormGroup label="End"><UInput v-model="form.endDate" type="date" required /></UFormGroup></div>
                    <UFormGroup label="Leave days" hint="Use 0.5 for half-day; applied to scheduled work days in date order"><UInput v-model.number="form.days" type="number" min="0.5" step="0.5" required /></UFormGroup>
                    <UFormGroup label="Reason"><UTextarea v-model="form.reason" required /></UFormGroup>
                    <UFormGroup label="Decision"><USelect v-model="form.status" :options="['PENDING','APPROVED','REJECTED','CANCELLED']" /></UFormGroup>
                    <UFormGroup label="Decision note"><UTextarea v-model="form.decisionNote" /></UFormGroup>
                    <div class="flex justify-end gap-2"><UButton color="gray" :disabled="saving" @click="open = false">Cancel</UButton><UButton type="submit" :loading="saving" :disabled="!form.userId || scope.busy.value">Save</UButton></div>
                </form>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>
