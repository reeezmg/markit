<script setup lang="ts">
import { useFindManyMoneyTransaction } from '~/lib/hooks/money-transaction';
const auth = useNuxtApp().$auth;
const companyId = computed(() => auth.session.value?.companyId);
const { data, isLoading, error, refetch } = useFindManyMoneyTransaction(computed(() => ({ where: { companyId: companyId.value }, orderBy: { createdAt: 'desc' as const } })), computed(() => ({ enabled: Boolean(companyId.value) })));
const rows = computed(() => (data.value || []).map(row => ({ ...row, date: new Date(row.createdAt).toLocaleDateString('en-IN'), amount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(row.amount)) })));
const columns = [{ key: 'date', label: 'Date' }, { key: 'partyType', label: 'Party' }, { key: 'direction', label: 'Direction' }, { key: 'paymentMode', label: 'Payment method' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }, { key: 'note', label: 'Note' }];
</script>
<template>
  <div class="p-6 space-y-4">
    <h1 class="text-xl font-semibold">Old money transactions</h1>
    <p class="text-sm text-gray-500">Original transaction history · {{ rows.length }} entries · Read only</p>
    <div class="flex gap-3"><UButton to="/accountant/money">Receive / Pay money</UButton><UButton variant="outline" @click="refetch()">Refresh</UButton></div>
    <p v-if="error" role="alert">Could not load transaction history. Please refresh.</p>
    <UTable :rows="rows" :columns="columns" :loading="isLoading" />
  </div>
</template>
