<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const props = defineProps<{ investorId: string }>(), api = useAccountantApi();
const detail = ref<any>(null), summary = ref<any>(null), currency = ref('INR');
const loading = ref(false), error = ref(''), edit = ref(false), movement = ref<'capital' | 'payouts' | null>(null), initialKind = ref<'CAPITAL_IN' | 'CAPITAL_OUT'>('CAPITAL_IN'), includeShares = ref(false), shareTrades = ref<any[]>([]), settlementTradeId = ref('');
let loadVersion = 0;
async function load() {
    const version = ++loadVersion, id = props.investorId, asOf = investmentToday();
    loading.value = true; error.value = '';
    try {
        const [result, list, settings, dues] = await Promise.all([api.get(`/investors/${id}`), api.get('/investors',{query:{asOf}}), api.get('/investors/share-settings'), api.get(`/investors/${id}/share-dues`,{query:{asOf}})]);
        if (version !== loadVersion) return;
        detail.value = result; includeShares.value = settings.includeShares; shareTrades.value = dues.trades;
        summary.value = list.data.find((p: any) => p.id === id);
        currency.value = list.currency;
    } catch (e: any) { if (version === loadVersion) error.value = e.message; }
    finally { if (version === loadVersion) loading.value = false; }
}
const events = computed(() => (detail.value?.events || []).map((e: any) => ({...e, investorName: detail.value.investor.name})));
watch(() => props.investorId, () => {
    detail.value = null; summary.value = null; shareTrades.value = []; settlementTradeId.value = ''; edit.value = false; movement.value = null;
    load();
}, {immediate: true});
async function saved() { edit.value = false; movement.value = null; await load(); }
const balances = [
    ['capital', 'Net capital cash received'], ['contributed', 'Capital contributed'], ['returned', 'Capital returned'],
    ['allocated', 'Profit allocated'], ['paid', 'Profit paid'], ['payable', 'Profit due'],
    ['loan', 'Outstanding investor loan principal'],
];
</script>
<template><div class="space-y-5 min-w-0">
    <UButton to="/investments/investors" variant="ghost" icon="i-heroicons-arrow-left">Investors</UButton>
    <UAlert v-if="error" color="red" :title="error" />
    <UButton v-if="error" variant="outline" @click="load">Retry investor</UButton>
    <p v-if="loading && !detail" role="status" class="text-sm text-gray-500">Loading investor profile...</p>
    <template v-if="detail">
        <div class="flex flex-wrap justify-between items-center gap-3">
            <div class="min-w-0"><h1 class="text-xl font-semibold break-words">{{ detail.investor.name }}</h1>
                <p class="text-sm text-gray-500">Investor profile - {{ detail.investor.profile.status }}</p></div>
            <UButton variant="outline" @click="edit = true">Edit profile</UButton>
        </div>
        <div class="flex flex-wrap gap-2">
            <UButton @click="settlementTradeId = ''; initialKind = 'CAPITAL_IN'; movement = 'capital'">{{ includeShares ? 'Buy shares' : 'Record capital movement' }}</UButton>
            <UButton v-if="includeShares" variant="outline" @click="settlementTradeId = ''; initialKind = 'CAPITAL_OUT'; movement = 'capital'">Redeem shares</UButton>
            <UButton variant="outline" @click="movement = 'payouts'">Pay profit</UButton>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <UCard v-for="[key, title] in balances" :key="key">
                <p class="text-sm text-gray-500">{{ title }}</p>
                <p class="text-xl font-semibold break-words">{{ investmentMoney(summary?.[key], currency) }}</p>
            </UCard>
        </div>
        <UCard v-if="includeShares || shareTrades.length">
            <template #header><h2 class="font-semibold">Share payments & dues</h2></template>
            <div class="grid gap-3 sm:grid-cols-2 mb-4"><div><p class="text-sm text-gray-500">Capital due from investor</p><p class="text-xl font-semibold">{{ investmentMoney(summary?.shareCapitalDue,currency) }}</p></div><div><p class="text-sm text-gray-500">Redemption due to investor</p><p class="text-xl font-semibold">{{ investmentMoney(summary?.shareRedemptionDue,currency) }}</p></div></div>
            <p class="text-sm text-gray-500 mb-3">Shares move when the transaction is recorded. Capital contains only confirmed cash payments. Settling a due does not move shares again.</p>
            <UTable :rows="shareTrades" :columns="[{key:'date',label:'Date'},{key:'kind',label:'Share transaction'},{key:'total',label:'Value'},{key:'paid',label:'Paid'},{key:'due',label:'Due'},{key:'status',label:'Status'},{key:'actions',label:''}]">
                <template #kind-data="{row}"><p>{{ row.kind==='SHARE_BUY'?'Purchase':'Redemption' }}</p><p class="text-xs text-gray-500">{{ row.shareQuantity }} shares at {{ row.pricePerShare }}</p></template>
                <template v-for="key in ['total','paid','due']" :key="key" #[`${key}-data`]="{row}">{{ investmentMoney(row[key],currency) }}</template>
                <template #actions-data="{row}"><UButton v-if="row.due>0&&!row.cancelled" variant="outline" @click="initialKind = row.capitalKind; settlementTradeId = row.id; movement = 'capital'">{{ row.kind==='SHARE_BUY'?'Receive payment':'Pay redemption due' }}</UButton></template>
            </UTable>
        </UCard>
        <p class="text-xs text-gray-500">Profit due is approved profit allocated to this investor, less payments already made.</p>
        <UCard>
            <template #header><h2 class="font-semibold">Investor details</h2></template>
            <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div><dt class="text-gray-500">Email</dt><dd class="break-words">{{ detail.investor.profile.email || 'Not provided' }}</dd></div>
                <div><dt class="text-gray-500">Phone</dt><dd>{{ detail.investor.profile.phone || 'Not provided' }}</dd></div>
                <div><dt class="text-gray-500">Status</dt><dd>{{ detail.investor.profile.status }}</dd></div>
                <div><dt class="text-gray-500">Current ownership</dt><dd>{{ summary?.terms ? `${summary.terms.ownershipPercent}%` : 'Not recorded' }}</dd></div>
                <div><dt class="text-gray-500">Current profit share</dt><dd>{{ summary?.terms ? `${summary.terms.profitPercent}%` : 'Not recorded' }}</dd></div>
                <div v-if="summary?.terms?.totalShares"><dt class="text-gray-500">Shares held</dt><dd>{{ summary?.terms?.totalShares ? `${summary.terms.shares} / ${summary.terms.totalShares} (${summary.terms.shareClass})` : 'Not recorded' }}</dd></div>
                <div class="sm:col-span-2"><dt class="text-gray-500">Notes</dt><dd class="whitespace-pre-wrap break-words">{{ detail.investor.profile.note || 'No notes added' }}</dd></div>
            </dl>
            <div class="mt-4"><h3 class="text-sm font-medium">Documents</h3>
                <p v-if="!detail.investor.profile.documents?.length" class="text-sm text-gray-500">No documents added.</p>
                <a v-for="doc in detail.investor.profile.documents" :key="doc.url" :href="doc.url" target="_blank" rel="noopener noreferrer" class="block underline text-primary-500 break-words">{{ doc.name }}</a>
            </div>
        </UCard>
        <UCard v-if="detail.terms?.length">
            <template #header><h2 class="font-semibold">Ownership history</h2></template>
            <div v-for="entry in detail.terms" :key="entry.id" class="py-2 border-b last:border-0 text-sm">
                <p>{{ String(entry.effective_date).slice(0,10) }} - {{ entry.terms.ownershipPercent }}% ownership - {{ entry.terms.profitPercent }}% profit share<span v-if="entry.terms.totalShares"> - {{ entry.terms.shares }} shares</span></p>
            </div>
        </UCard>
        <section aria-labelledby="investor-statement-title" class="min-w-0 space-y-3">
            <h2 id="investor-statement-title" class="font-semibold">Transactions & account history</h2>
            <p class="text-sm text-gray-500">Capital movements, profit allocations, payouts, investor loan principal and reversals.</p>
            <InvestmentsLedgerTable :key="investorId" :events="events" :currency="currency" :investor-id="investorId" @changed="load" />
        </section>
        <InvestmentsProfileModal v-if="edit" :investor="{...detail.investor, terms: summary?.terms}" @close="edit = false" @saved="saved" />
        <InvestmentsMovementModal v-if="movement" :mode="movement" :investor-id="investorId" :initial-kind="initialKind" :initial-trade-id="settlementTradeId" @close="movement = null" @saved="saved" />
    </template>
</div></template>
