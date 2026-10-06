<script setup lang="ts">
import { useFindManyAccountTransfer } from '~/lib/hooks/account-transfer';
import { useFindManyBankAccount } from '~/lib/hooks/bank-account';
const auth = useNuxtApp().$auth;
const companyId = computed(() => auth.session.value?.companyId);
const { data, isLoading, error, refetch } = useFindManyAccountTransfer(computed(() => ({ where: { companyId: companyId.value }, orderBy: { createdAt: 'desc' as const } })), computed(() => ({ enabled: Boolean(companyId.value) })));
const { data: banks } = useFindManyBankAccount(computed(() => ({ where: { companyId: companyId.value } })), computed(() => ({ enabled: Boolean(companyId.value) })));
const accountName = (type: string, id: string | null) => type !== 'BANK' ? type : id ? banks.value?.find(bank => bank.id === id)?.bankName || id : 'Primary Bank';
const rows = computed(() => (data.value || []).map(row => ({ ...row, date: new Date(row.createdAt).toLocaleDateString('en-IN'), from: accountName(row.fromType, row.fromAccountId), to: accountName(row.toType, row.toAccountId), amount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(row.amount)) })));
const columns = [{ key: 'date', label: 'Date' }, { key: 'from', label: 'From account' }, { key: 'to', label: 'To account' }, { key: 'amount', label: 'Amount' }, { key: 'note', label: 'Note' }];
</script>
<template>
  <div class="p-6 space-y-4">
    <h1 class="text-xl font-semibold">Old account transfers</h1>
    <p class="text-sm text-gray-500">Original transfer history · {{ rows.length }} entries · Read only</p>
    <div class="flex gap-3"><UButton to="/accountant/account-transfers">New account transfers</UButton><UButton variant="outline" @click="refetch()">Refresh</UButton></div>
    <p v-if="error" role="alert">Could not load transfer history. Please refresh.</p>
    <UTable :rows="rows" :columns="columns" :loading="isLoading" />
  </div>
</template>
