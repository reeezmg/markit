<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const api = useAccountantApi(), route = useRoute();
const loans = ref<any[]>([]), loading = ref(true), ready = ref(false), error = ref(''), currency = ref('INR');
const search = ref(''), period = ref('DUE');
const today = investmentToday();
const rows = computed(() => loans.value.filter(loan => loan.status === 'OPEN' && (!route.query.investor || loan.investor_id === route.query.investor))
    .flatMap(loan => loan.position.rows.filter((row: any) => row.totalDue > 0).map((row: any) => ({ ...row, loanId: loan.id, loanName: loan.name, lender: loan.investor_name })))
    .filter(row => (period.value === 'ALL' || (period.value === 'DUE' ? row.date <= today : row.date > today)) && `${row.loanName} ${row.lender}`.toLowerCase().includes(search.value.trim().toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date) || a.loanName.localeCompare(b.loanName) || a.number - b.number));
const columns = [{ key: 'date', label: 'Due date' }, { key: 'loanName', label: 'Loan' }, { key: 'lender', label: 'Lender' }, { key: 'number', label: 'Instalment' }, { key: 'principalDue', label: 'Principal unpaid' }, { key: 'interestDue', label: 'Interest unpaid' }, { key: 'totalDue', label: 'Total unpaid' }, { key: 'status', label: 'Status' }, { key: 'actions', label: '' }];
function location(row: any, repay = false) { return { path: `/loans/${row.loanId}`, query: { ...route.query, entryCompany: api.companyId.value, loan: undefined, repay: repay ? '1' : undefined } }; }
async function load() {
    loading.value = true; error.value = '';
    try { const result = await api.get('/loans'); ready.value = result.ready; loans.value = result.data; currency.value = result.currency; }
    catch (e: any) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
</script>
<template><div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-xl font-semibold">Repayments</h1><p class="text-sm text-gray-500 mt-1">Review unpaid instalments and record payments against their loan.</p></div><UButton variant="outline" :loading="loading" @click="load">Refresh</UButton></div>
    <UAlert v-if="error" color="red" :title="error" />
    <UAlert v-if="!loading && !ready && !error" color="orange" title="Loan management installation pending" />
    <UCard v-if="loading || ready">
        <div class="flex flex-wrap gap-3 mb-4"><UInput v-model="search" placeholder="Search loan or lender" aria-label="Search loan or lender" icon="i-heroicons-magnifying-glass" /><USelect v-model="period" aria-label="Instalment period" :options="[{value: 'DUE', label: 'Due and overdue'}, {value: 'UPCOMING', label: 'Upcoming'}, {value: 'ALL', label: 'All unpaid'}]" /></div>
        <UTable :rows="rows" :columns="columns" :loading="loading">
            <template #loanName-data="{ row }"><NuxtLink :to="location(row)" class="text-primary-500">{{ row.loanName }}</NuxtLink></template>
            <template v-for="key in ['principalDue', 'interestDue', 'totalDue']" :key="key" #[`${key}-data`]="{ row }">{{ investmentMoney(row[key], currency) }}</template>
            <template #status-data="{ row }"><UBadge :color="row.status === 'OVERDUE' ? 'red' : 'gray'" variant="subtle">{{ row.status }}</UBadge></template>
            <template #actions-data="{ row }"><UButton v-if="row.date <= today" size="xs" :to="location(row, true)">Record repayment</UButton><UButton v-else size="xs" variant="ghost" :to="location(row)">View loan</UButton></template>
        </UTable>
        <p class="text-xs text-gray-500 mt-3">Payments already recorded are shown in each loan's payment history. Upcoming instalments become payable on their due date.</p>
    </UCard>
</div></template>
