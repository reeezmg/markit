<script setup lang="ts">
const props = defineProps<{ companyId: string }>();
const workflow = useSalesWorkflow(computed(() => props.companyId), useRequestFetch());
const includeInvoicing = ref(false), includeAfterSales = ref(false), busy = ref(false), error = ref(''), saved = ref(false);
watch(() => workflow.preferences.value.includeInvoicing, value => { includeInvoicing.value = value; }, { immediate: true });
watch(() => workflow.preferences.value.includeAfterSales, value => { includeAfterSales.value = value; }, { immediate: true });
watch([includeInvoicing, includeAfterSales], () => { saved.value = false; });
async function save() {
    if (busy.value || workflow.loading.value || !workflow.canManage.value) return;
    busy.value = true; error.value = ''; saved.value = false;
    try { await workflow.save({ includeInvoicing: includeInvoicing.value, includeAfterSales: includeAfterSales.value }); saved.value = true; }
    catch (e: any) { error.value = e.data?.statusMessage || e.message; } finally { busy.value = false; }
}
</script>
<template><UCard>
    <form class="space-y-4" @submit.prevent="save">
        <h2 class="font-semibold">Sales workflow</h2>
        <UCheckbox v-model="includeInvoicing" label="Enable invoicing workflow" :disabled="busy || workflow.loading.value || !workflow.canManage.value" help="Include quotes, sales orders, recurring invoices, retainer invoices and payments received. Turn off for a simple Billing, Sales and Credit menu." />
        <h2 class="font-semibold pt-2">After-sales</h2>
        <UCheckbox v-model="includeAfterSales" label="Enable after-sales" :disabled="busy || workflow.loading.value || !workflow.canManage.value" help="Show after-sales menus, product coverage plans, billing registration, service history and related settings. Turn off if this company does not need after-sales." />
        <UAlert v-if="error || workflow.error.value" color="red" :title="error || workflow.error.value" />
        <p v-if="saved" role="status" class="text-sm text-green-700">Workflow settings saved.</p>
        <p v-if="!workflow.loading.value && !workflow.canManage.value" class="text-xs text-gray-500">An administrator, manager or accountant can change this setting.</p>
        <div class="flex justify-end"><UButton type="submit" :loading="busy" :disabled="workflow.loading.value || !workflow.canManage.value">Save workflow</UButton></div>
    </form>
</UCard></template>
