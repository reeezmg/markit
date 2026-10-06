<script setup lang="ts">
import { investmentMoney } from '~/utils/investments';
const props = defineProps<{ mode: 'capital' | 'payouts' }>();
const api = useAccountantApi(),
    route = useRoute(),
    events = ref<any[]>([]),
    profiles = ref<any[]>([]),
    currency = ref('INR'),
    loading = ref(false),
    error = ref(''),
    showForm = ref(false);
const initialInvestor =
    typeof route.query.investor === 'string' ? route.query.investor : undefined;
const totals = computed(() =>
    profiles.value.reduce(
        (s, p) => ({
            capital: s.capital + Number(p.capital),
            loan: s.loan + Number(p.loan),
            paid: s.paid + Number(p.paid),
            payable: s.payable + Number(p.payable),
        }),
        { capital: 0, loan: 0, paid: 0, payable: 0 }
    )
);
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const [ledger, list] = await Promise.all([
            api.get('/investors/ledger'),
            api.get('/investors'),
        ]);
        events.value = ledger.events;
        currency.value = ledger.currency;
        profiles.value = list.data;
    } catch (e: any) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}
onMounted(load);
async function saved() {
    showForm.value = false;
    await load();
}
</script>
<template
    ><div class="space-y-5"
        ><div class="flex justify-between items-center gap-3"
            ><div
                ><h1 class="text-xl font-semibold">{{
                    mode === 'capital' ? 'Capital & loans' : 'Profit payouts'
                }}</h1
                ><p class="text-sm text-gray-500">{{
                    mode === 'capital'
                        ? 'Record investor contributions, capital returns and loans.'
                        : 'Record payments against approved profit allocations.'
                }}</p></div
            ><UButton :disabled="loading" @click="showForm = true">{{
                mode === 'capital' ? 'Record movement' : 'Record payment'
            }}</UButton></div
        ><UAlert v-if="error" color="red" :title="error" /><div
            class="grid sm:grid-cols-2 gap-4"
            ><UCard
                v-for="[key, title] in mode === 'capital'
                    ? [
                          ['capital', 'Net capital'],
                          ['loan', 'Investor loans'],
                      ]
                    : [
                          ['payable', 'Profit awaiting payment'],
                          ['paid', 'Profit paid'],
                      ]"
                :key="key"
                ><p class="text-sm text-gray-500">{{ title }}</p
                ><p class="text-2xl font-semibold">{{
                    investmentMoney((totals as any)[key], currency)
                }}</p></UCard
            ></div
        ><p v-if="loading" class="text-sm text-gray-500">Loading movements…</p
        ><InvestmentsLedgerTable
            v-else
            :events="events"
            :currency="currency"
            :mode="mode"
            :investor-id="initialInvestor"
            @changed="load" /><InvestmentsMovementModal
            v-if="showForm"
            :mode="mode"
            :investor-id="initialInvestor"
            @close="showForm = false"
            @saved="saved" /></div
></template>
