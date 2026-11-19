<script setup lang="ts">
import { investmentMoney, investmentToday, type InvestmentMovementMode } from '~/utils/investments';
const props = defineProps<{ mode: InvestmentMovementMode }>();
const page = computed(() => ({
    capital: {
        title: 'Capital',
        description: 'Record investor contributions and capital returns. Choose a new share movement with payment confirmation, or settle an existing share due without moving shares again. Only actual payments appear in this capital statement.',
        action: 'Record capital movement',
        cards: [['contributed', 'Capital contributed'], ['returned', 'Capital returned'], ['capital', 'Net contributed capital']],
    },
    loans: {
        title: 'Investor loans',
        description: 'Record money borrowed from investors and repayments of loan principal. Record interest separately as an expense.',
        action: 'Record loan movement',
        cards: [['loan', 'Outstanding loan principal']],
    },
    payouts: {
        title: 'Profit payouts',
        description: 'Record payments against approved profit allocations.',
        action: 'Record payment',
        cards: [['payable', 'Profit awaiting payment'], ['paid', 'Profit paid']],
    },
}[props.mode]));
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
            contributed: s.contributed + Number(p.contributed),
            returned: s.returned + Number(p.returned),
            loan: s.loan + Number(p.loan),
            paid: s.paid + Number(p.paid),
            payable: s.payable + Number(p.payable),
        }),
        { capital: 0, contributed: 0, returned: 0, loan: 0, paid: 0, payable: 0 }
    )
);
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const [ledger, list] = await Promise.all([
            api.get('/investors/ledger'),
            api.get('/investors',{query:{asOf:investmentToday()}}),
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
                    page.title
                }}</h1
                ><p class="text-sm text-gray-500">{{
                    page.description
                }}</p></div
            ><UButton :disabled="loading" @click="showForm = true">{{
                page.action
            }}</UButton></div
        ><UAlert v-if="error" color="red" :title="error" /><div
            class="grid sm:grid-cols-2 gap-4"
            ><UCard
                v-for="[key, title] in page.cards"
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
