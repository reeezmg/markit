<script setup lang="ts">
import { accountDefaultGroups, acceptsDefaultAccount } from '~/utils/account-defaults';
const api = useAccountantApi();
const accounts = ref<any[]>([]), mappings = reactive<Record<string, string>>({}), loading = ref(true), busy = ref(false), error = ref(''), saved = ref(false);
const fields = accountDefaultGroups.loans.fields;
async function load() {
    loading.value = true; error.value = '';
    try {
        const settings = await api.post('/account-settings/investment-defaults', {});
        const options = await api.get('/loans/options');
        accounts.value = options.accounts.filter((a: any) => a.currency === options.currency);
        for (const key of Object.keys(fields)) mappings[key] = settings.defaults.loans[key] || '';
    } catch (e: any) { error.value = e.message; } finally { loading.value = false; }
}
async function save() {
    if (busy.value || loading.value) return;
    busy.value = true; error.value = ''; saved.value = false;
    try { await api.put('/account-settings/loans', { mappings: { ...mappings } }); saved.value = true; }
    catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}
onMounted(load);
</script>
<template><div class="space-y-5 max-w-4xl">
    <div><h1 class="text-xl font-semibold">Loan settings</h1><p class="text-sm text-gray-500 mt-1">Default accounts for new loans. Each loan keeps its saved accounts.</p></div>
    <UAlert v-if="error" color="red" :title="error" />
    <UAlert v-if="saved" color="green" title="Loan defaults saved" />
    <p v-if="loading" class="text-sm text-gray-500">Loading loan defaults...</p>
    <UCard><form class="space-y-5" @submit.prevent="save"><fieldset :disabled="loading || busy" class="grid sm:grid-cols-2 gap-4">
        <UFormGroup v-for="(field, key) in fields" :key="key" :label="field.label" required>
            <USelect v-model="mappings[key]" :options="accounts.filter(a => acceptsDefaultAccount(field, a)).map(a => ({value: a.id, label: `${a.code || ''} ${a.name}`.trim()}))" placeholder="Select account" required />
        </UFormGroup>
    </fieldset><p class="text-xs text-gray-500">Missing standard accounts are created automatically. You can override these defaults when recording a loan. Repayments initially use the cash/bank account saved on that loan.</p><div class="flex justify-end"><UButton type="submit" :disabled="loading" :loading="busy">Save loan settings</UButton></div></form></UCard>
</div></template>
