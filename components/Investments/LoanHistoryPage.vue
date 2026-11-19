<script setup lang="ts">
const api = useAccountantApi(), route = useRoute(), events = ref<any[]>([]), currency = ref('INR'), error = ref(''), loading = ref(true);
async function load() {
    loading.value = true; error.value = '';
    try { const result = await api.get('/investors/ledger'); events.value = result.events.filter((e: any) => !e.details.loanId); currency.value = result.currency; }
    catch (e: any) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
</script>
<template><div class="space-y-4"><UButton :to="{path: '/loans', query: {...route.query, entryCompany: api.companyId.value, loan: undefined, repay: undefined}}" variant="ghost" icon="i-heroicons-arrow-left">Loans</UButton><h1 class="text-xl font-semibold">Earlier loan history</h1><p class="text-sm text-gray-500">Earlier movements remain in investor balances. Adding a new loan records a new receipt; it does not convert this history into agreements.</p><UAlert v-if="error" color="red" :title="error" /><p v-if="loading">Loading history…</p><InvestmentsLedgerTable v-else :events="events" :currency="currency" mode="loans" @changed="load" /></div></template>
