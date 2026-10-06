<script setup lang="ts">
import { investmentMoney } from '~/utils/investments';
const props = defineProps<{ investorId: string }>(),
    api = useAccountantApi();
const detail = ref<any>(null),
    summary = ref<any>(null),
    currency = ref('INR'),
    error = ref(''),
    edit = ref(false);
async function load() {
    error.value = '';
    try {
        const [r, list] = await Promise.all([
            api.get(`/investors/${props.investorId}`),
            api.get('/investors'),
        ]);
        detail.value = r;
        summary.value = list.data.find((p: any) => p.id === props.investorId);
        currency.value = list.currency;
    } catch (e: any) {
        error.value = e.message;
    }
}
const events = computed(() =>
    (detail.value?.events || []).map((e: any) => ({
        ...e,
        investorName: detail.value.investor.name,
    }))
);
onMounted(load);
async function saved() {
    edit.value = false;
    await load();
}
</script>
<template
    ><div class="space-y-5"
        ><UButton
            to="/investments/investors"
            variant="ghost"
            icon="i-heroicons-arrow-left"
            >Investors</UButton
        ><UAlert v-if="error" color="red" :title="error" /><template
            v-if="detail"
            ><div class="flex justify-between items-center gap-3"
                ><div
                    ><h1 class="text-xl font-semibold">{{
                        detail.investor.name
                    }}</h1
                    ><p class="text-sm text-gray-500">{{
                        summary?.terms
                            ? `${summary.terms.ownershipPercent}% ownership · ${summary.terms.profitPercent}% profit share`
                            : 'Ownership agreement not recorded'
                    }}</p></div
                ><UButton variant="outline" @click="edit = true"
                    >Edit profile</UButton
                ></div
            ><div class="flex flex-wrap gap-2"
                ><UButton
                    :to="{
                        path: '/investments/capital',
                        query: { investor: investorId },
                    }"
                    >Capital & loans</UButton
                ><UButton
                    :to="{
                        path: '/investments/payouts',
                        query: { investor: investorId },
                    }"
                    variant="outline"
                    >Profit payouts</UButton
                ><UButton
                    :to="{
                        path: '/investments/investors',
                        query: { investor: investorId },
                    }"
                    variant="outline"
                    >Ownership history</UButton
                ></div
            ><div class="grid gap-3 sm:grid-cols-3"
                ><UCard
                    v-for="[key, title] in [
                        ['capital', 'Net capital'],
                        ['allocated', 'Profit allocated'],
                        ['paid', 'Profit paid'],
                        ['payable', 'Profit awaiting payment'],
                        ['loan', 'Investor loan'],
                        ['contributed', 'Capital contributed'],
                    ]"
                    :key="key"
                    ><p class="text-sm text-gray-500">{{ title }}</p
                    ><p class="text-xl font-semibold">{{
                        investmentMoney(summary?.[key], currency)
                    }}</p></UCard
                ></div
            ><UCard
                ><div class="grid gap-4 sm:grid-cols-2"
                    ><div
                        ><p>{{ detail.investor.profile.email }}</p
                        ><p>{{ detail.investor.profile.phone }}</p
                        ><p class="text-xs text-gray-500">{{
                            detail.investor.profile.status
                        }}</p></div
                    ><div
                        ><a
                            v-for="doc in detail.investor.profile.documents"
                            :key="doc.url"
                            :href="doc.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="block underline text-primary-500"
                            >{{ doc.name }}</a
                        ></div
                    ></div
                ><p class="mt-3 text-sm whitespace-pre-wrap">{{
                    detail.investor.profile.note
                }}</p></UCard
            ><h2 class="font-semibold">Account statement</h2
            ><InvestmentsLedgerTable
                :events="events"
                :currency="currency"
                :investor-id="investorId"
                @changed="load" /><InvestmentsProfileModal
                v-if="edit"
                :investor="detail.investor"
                @close="edit = false"
                @saved="saved" /></template></div
></template>
