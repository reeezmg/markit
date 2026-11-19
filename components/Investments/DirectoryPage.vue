<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const api = useAccountantApi(), route = useRoute();
const rows = ref<any[]>([]), loading = ref(false), error = ref(''), search = ref(''), currency = ref('INR');
const asOf = ref(investmentToday()), showProfile = ref(false);
const filtered = computed(() => rows.value.filter(p => [p.name, p.profile.email, p.profile.phone].some(v => String(v || '').toLowerCase().includes(search.value.toLowerCase()))));
const columns = [
    {key: 'name', label: 'Investor'}, {key: 'ownership', label: 'Ownership'},
    {key: 'shares', label: 'Shares held'}, {key: 'profit', label: 'Profit share'},
    {key: 'capital', label: 'Capital balance'}, {key: 'payable', label: 'Profit due'},
];
async function load() {
    loading.value = true; error.value = '';
    try {
        const result = await api.get('/investors', {query: {asOf: asOf.value}});
        rows.value = result.data; currency.value = result.currency;
    } catch (e: any) { error.value = e.message; }
    finally { loading.value = false; }
}
function openInvestor(row: any) { return navigateTo(`/investments/investors/${row.id}`); }
async function profileSaved() { showProfile.value = false; await load(); }
onMounted(async () => {
    if (typeof route.query.investor === 'string' && route.query.investor) {
        await navigateTo(`/investments/investors/${encodeURIComponent(route.query.investor)}`);
        return;
    }
    await load();
});
</script>
<template><div class="space-y-5">
    <div class="flex flex-wrap justify-between items-center gap-3">
        <div><h1 class="text-xl font-semibold">Investors</h1><p class="text-sm text-gray-500">Open an investor to view their profile, holdings and account.</p></div>
        <UButton icon="i-heroicons-plus" @click="showProfile = true">Add investor</UButton>
    </div>
    <UAlert v-if="error" color="red" :title="error" />
    <UButton v-if="error" variant="outline" @click="load">Retry investors</UButton>
    <UCard><div class="flex flex-wrap justify-between gap-3 mb-4">
        <UInput v-model="search" placeholder="Search name, email or phone" aria-label="Search investors" icon="i-heroicons-magnifying-glass" class="w-full sm:max-w-sm" />
        <UFormGroup label="Balances & ownership as of"><UInput v-model="asOf" type="date" @change="load" /></UFormGroup>
    </div>
            <UTable :rows="filtered" :columns="columns" :loading="loading" @select="openInvestor"
                ><template #name-data="{ row }">
                    <NuxtLink
                        :to="`/investments/investors/${row.id}`"
                        class="font-medium text-primary-500"
                        >{{ row.name }}</NuxtLink
                    >
                    <p class="text-xs text-gray-500"
                        >{{ row.profile.status
                        }}<span v-if="row.profile.email">
                            | {{ row.profile.email }}</span
                        ></p
                    >
                </template>
                <template #capital-data="{ row }">{{
                    investmentMoney(row.capital, currency)
                }}</template>
                <template #payable-data="{ row }">{{
                    investmentMoney(row.payable, currency)
                }}</template>
                <template #ownership-data="{ row }">{{
                    row.terms
                        ? `${row.terms.ownershipPercent}%`
                        : 'Not recorded'
                }}</template
                ><template #shares-data="{ row }">{{
                    row.terms?.totalShares
                        ? `${row.terms.shares} / ${row.terms.totalShares}`
                        : '—'
                }}</template
                ><template #profit-data="{ row }">{{
                    row.terms ? `${row.terms.profitPercent}%` : 'Not recorded'
                }}</template
                ></UTable>
    </UCard>
    <InvestmentsProfileModal v-if="showProfile" @close="showProfile = false" @saved="profileSaved" />
</div></template>
