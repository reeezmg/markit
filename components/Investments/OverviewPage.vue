<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const api = useAccountantApi(),
    asOf = ref(investmentToday()),
    rows = ref<any[]>([]),
    currency = ref('INR'),
    loading = ref(false),
    error = ref('');
const cards = [
    ['capital', 'Net invested capital'],
    ['allocated', 'Profit allocated'],
    ['paid', 'Profit paid'],
    ['payable', 'Profit awaiting payment'],
    ['loan', 'Investor loans'],
    ['contributed', 'Total contributions'],
];
const totals = computed(() =>
    Object.fromEntries(
        cards.map(([key]) => [
            key,
            rows.value.reduce((s, p) => s + Number(p[key] || 0), 0),
        ])
    )
);
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const data = await api.get('/investors', {
            query: { asOf: asOf.value },
        });
        rows.value = data.data;
        currency.value = data.currency;
    } catch (e: any) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}
onMounted(load);
</script>
<template
    ><div class="space-y-6">
        <div class="flex flex-wrap justify-between items-end gap-4"
            ><div
                ><h1 class="text-xl font-semibold"
                    >Your investments at a glance</h1
                ><p class="text-sm text-gray-500"
                    >{{ rows.length }} investors · balances across the selected
                    company</p
                ></div
            ><UFormGroup label="As of"
                ><UInput
                    v-model="asOf"
                    type="date"
                    @change="load" /></UFormGroup
        ></div>
        <UAlert v-if="error" color="red" :title="error" /><p
            v-if="loading"
            class="text-sm text-gray-500"
            >Loading balances…</p
        >
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            ><UCard v-for="[key, title] in cards" :key="key"
                ><p class="text-sm text-gray-500">{{ title }}</p
                ><p class="mt-2 text-2xl font-semibold">{{
                    investmentMoney(totals[key], currency)
                }}</p></UCard
            ></div
        >
        <UCard
            ><h2 class="font-semibold mb-4">A simple flow</h2
            ><div class="grid gap-5 md:grid-cols-3"
                ><div
                    ><p class="font-medium">1. Add investors & shares</p
                    ><p class="text-sm text-gray-500 my-2"
                        >Keep investor profiles and their dated ownership
                        agreements up to date.</p
                    ><UButton to="/investments/investors" variant="outline"
                        >Manage investors</UButton
                    ></div
                ><div
                    ><p class="font-medium">2. Share company profit</p
                    ><p class="text-sm text-gray-500 my-2"
                        >Pick a period, review the calculated profit and approve
                        everyone's share together.</p
                    ><UButton to="/investments/allocate"
                        >Allocate profit</UButton
                    ></div
                ><div
                    ><p class="font-medium">3. Record payments</p
                    ><p class="text-sm text-gray-500 my-2"
                        >Pay investors from cash or bank and track the amount
                        still due.</p
                    ><UButton to="/investments/payouts" variant="outline"
                        >Profit payouts</UButton
                    ></div
                ></div
            ></UCard
        >
    </div></template
>
