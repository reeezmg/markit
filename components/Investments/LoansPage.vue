<script setup lang="ts">
import { investmentMoney } from '~/utils/investments';
const api = useAccountantApi(), route = useRoute();
const loans = ref<any[]>([]), currency = ref('INR'), ready = ref(false), loading = ref(true), error = ref(''), showForm = ref(false);
const investorId = typeof route.query.investor === 'string' ? route.query.investor : undefined;
const visibleLoans = computed(() => investorId ? loans.value.filter(l => l.investor_id === investorId) : loans.value);
const columns = [{ key: 'name', label: 'Loan' }, { key: 'investor_name', label: 'Lender' }, { key: 'status', label: 'Status' }, { key: 'principal', label: 'Principal outstanding' }, { key: 'interest', label: 'Interest due' }, { key: 'nextDue', label: 'Next payment' }, { key: 'actions', label: '' }];
function location(id: string, repay = false) { return { path: `/loans/${id}`, query: { ...route.query, entryCompany: api.companyId.value, loan: undefined, ...(repay ? { repay: '1' } : {}) } }; }
async function open(row: any) { await navigateTo(location(row.id)); }
async function saved() { showForm.value = false; await load(); }
async function load() {
    loading.value = true; error.value = '';
    try { const list = await api.get('/loans'); ready.value = list.ready; loans.value = list.data; currency.value = list.currency; }
    catch (e: any) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(async () => { if (typeof route.query.loan === 'string') { await navigateTo(location(route.query.loan), { replace: true }); return; } await load(); });
</script>
<template><div class="space-y-5">
    <div class="flex flex-wrap justify-between items-center gap-3"><h1 class="text-xl font-semibold">Loans</h1><div class="flex gap-2"><UButton :to="{path: '/loans/history', query: {...route.query, entryCompany: api.companyId.value, loan: undefined, repay: undefined}}" variant="ghost">Earlier loan history</UButton><UButton :disabled="loading || !ready" @click="showForm = true">New loan</UButton></div></div>
    <UAlert v-if="error" color="red" :title="error" />
    <UAlert v-if="!loading && !ready" color="orange" title="Loan management installation pending" description="The loan database update must be installed before loans can be saved." />
    <UCard v-if="ready || loading"><UTable :rows="visibleLoans" :columns="columns" :loading="loading" @select="open">
        <template #name-data="{ row }"><NuxtLink :to="location(row.id)" class="text-primary-500" @click.stop>{{ row.name }}</NuxtLink></template>
        <template #status-data="{ row }"><UBadge variant="subtle">{{ row.status === 'DRAFT' ? 'INCOMPLETE' : row.status }}</UBadge></template>
        <template #principal-data="{ row }">{{ ['DRAFT', 'CANCELLED'].includes(row.status) ? '?' : investmentMoney(row.position.principal, currency) }}</template>
        <template #interest-data="{ row }">{{ ['DRAFT', 'CANCELLED'].includes(row.status) ? '?' : investmentMoney(row.position.interestDue, currency) }}</template>
        <template #nextDue-data="{ row }">{{ row.status === 'OPEN' ? row.position.nextDue || '?' : '?' }}</template>
        <template #actions-data="{ row }"><div class="flex gap-2" @click.stop><UButton size="xs" variant="ghost" :to="location(row.id)">Open</UButton><UButton v-if="row.status === 'OPEN'" size="xs" :aria-label="`Repay ${row.name}`" :to="location(row.id, true)">Repay loan</UButton></div></template>
    </UTable></UCard>
    <InvestmentsLoanForm v-if="showForm" :investor-id="investorId" @close="showForm = false" @saved="saved" />
</div></template>
