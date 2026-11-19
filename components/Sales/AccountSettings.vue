<script setup lang="ts">
const scope = useCompanyScope(), selectedAccounts = useSelectedAccounts(), toast = useToast();
const allowed = computed(() => ['admin', 'manager', 'accountant'].includes(scope.auth.session.value?.role || ''));
const state = ref<any>(null), mappings = reactive<Record<string, string>>({}), loading = ref(true), busy = ref(false), error = ref('');
const fields = [
    { key: 'cash', label: 'Cash', type: 'CASH' }, { key: 'bank', label: 'Payment bank', type: 'BANK' },
    { key: 'receivable', label: 'Customer credit / receivable', type: 'ACCOUNTS_RECEIVABLE' },
    { key: 'sales', label: 'Sales income', type: 'INCOME' }, { key: 'outputTax', label: 'Sales tax payable', type: 'OTHER_CURRENT_LIABILITY' },
    { key: 'stock', label: 'Stock / inventory', type: 'STOCK' }, { key: 'cogs', label: 'Cost of goods sold', type: 'COST_OF_GOODS_SOLD' },
];
function request(method: 'GET' | 'PUT' | 'POST', owner: string, path = '/erp', body?: any) {
    return scope.fetch<any>(`/api/accountant${path}`, { method, headers: { 'x-company-id': owner, 'x-company-filter': owner }, ...(body ? { body } : {}) });
}
async function load() {
    if (!allowed.value) { loading.value = false; return; }
    loading.value = true; error.value = '';
    try { state.value = await request('GET', scope.companyId.value); Object.assign(mappings, state.value.mappings); }
    catch (e: any) { error.value = e.data?.statusMessage || e.message; } finally { loading.value = false; }
}
async function save(enable = false) {
    if (busy.value || loading.value || !allowed.value) return;
    const owner = scope.companyId.value, edited = { ...mappings };
    busy.value = true; error.value = '';
    try {
        const current = await request('GET', owner), merged = { ...current.mappings };
        for (const field of fields) merged[field.key] = edited[field.key];
        await request('PUT', owner, '/erp', { mappings: merged });
        if (enable) await request('POST', owner, '/erp/enable');
        await selectedAccounts.refresh(owner);
        state.value = await request('GET', owner);
        toast.add({ title: 'Sales account settings saved', color: 'green' });
    } catch (e: any) { error.value = e.data?.statusMessage || e.message; } finally { busy.value = false; }
}
onMounted(load);
</script>
<template><UDashboardPanelContent class="space-y-4">
    <UAlert v-if="!allowed" color="amber" title="Sales accounts require an admin, manager or accountant role." />
    <UAlert v-if="error" color="red" :title="error" /><p v-if="loading" class="text-sm text-gray-500">Loading sales accounts...</p>
    <UCard v-if="allowed && state"><template #header><div class="flex flex-wrap justify-between gap-3"><h2 class="font-semibold">Sales accounts</h2><UBadge :color="state.enabled ? 'green' : 'gray'">{{ state.enabled ? 'Posting enabled' : 'Not connected' }}</UBadge></div></template>
        <form class="space-y-5" @submit.prevent="save()"><fieldset :disabled="busy" class="grid sm:grid-cols-2 gap-4"><UFormGroup v-for="field in fields" :key="field.key" :label="field.label" required><USelect v-model="mappings[field.key]" :options="state.accounts.filter((account: any) => account.accountType === field.type).map((account: any) => ({value: account.id, label: account.name}))" placeholder="Select account" required /></UFormGroup></fieldset>
            <p class="text-xs text-gray-500">These are the same mappings as Settings > Account > Billing &amp; sales. Cash and bank accounts are shared with expenses. Saving preserves other expense mappings and existing transactions.</p>
            <p v-if="!state.enabled" class="text-xs text-gray-500">Connect accounting to post new sales and expenses. Earlier documents remain excluded.</p>
            <div class="flex flex-wrap justify-end gap-3"><UButton v-if="!state.enabled" variant="outline" :loading="busy" @click="save(true)">Save and connect accounting</UButton><UButton type="submit" :loading="busy">Save sales accounts</UButton></div>
        </form>
    </UCard>
</UDashboardPanelContent></template>
