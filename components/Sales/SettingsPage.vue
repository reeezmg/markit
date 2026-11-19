<script setup lang="ts">
import PrinterSettings from '~/pages/settings/printer.vue';
import NumberingSettings from '~/pages/settings/numbering.vue';
import BillingPreferences from '~/components/Billing/Preferences.vue';
import QuotePreferences from '~/components/Quotes/Preferences.vue';
import AccountSettings from './AccountSettings.vue';
const company = await useSettingsCompany();
const scope = company.scope, route = useRoute(), router = useRouter();
const sections = [
    { key: 'accounts', label: 'Accounts' }, { key: 'printer', label: 'Printer' },
    { key: 'numbering', label: 'Numbering' }, { key: 'preferences', label: 'Sales preferences' },
];
const section = computed(() => sections.some(item => item.key === route.query.section) ? String(route.query.section) : 'accounts');
const links = computed(() => sections.map(item => ({ label: item.label, to: { path: '/erp/settings', query: { ...route.query, entryCompany: scope.companyId.value, section: item.key } }, active: section.value === item.key })));
const preference = ref<'invoice' | 'sale' | 'quote' | 'sales-order' | null>(null);
const preferenceOptions = [
    { key: 'sale', title: 'Pay now sales', description: 'Customer notes, terms and sales-list defaults.' },
    { key: 'invoice', title: 'Invoices', description: 'Payment terms, customer notes and invoice-list defaults.' },
    { key: 'quote', title: 'Quotes', description: 'Quote defaults, expiry, numbering and document design.' },
    { key: 'sales-order', title: 'Sales orders', description: 'Order defaults, delivery, payment and document design.' },
] as const;
const billingOpen = computed({ get: () => preference.value === 'invoice' || preference.value === 'sale', set: value => { if (!value) preference.value = null; } });
const quoteOpen = computed({ get: () => preference.value === 'quote' || preference.value === 'sales-order', set: value => { if (!value) preference.value = null; } });
async function selectCompany(id: string) {
    if (scope.companies.value.some(item => item.id === id)) await router.replace({ path: route.path, query: { ...route.query, entryCompany: id } });
}
</script>
<template><div class="flex flex-col flex-1 min-h-0">
    <div class="px-4 pt-5 sm:px-6"><h1 class="text-xl font-semibold">Sales settings</h1><p class="text-sm text-gray-500 mt-1">Accounts, printing and document defaults for {{ scope.companyName(scope.companyId.value) }}.</p>
        <CompanyControlPlacement v-if="scope.enabled.value" toolbar><UFormGroup size="xs"><USelect aria-label="Company / branch" :model-value="scope.companyId.value" :options="scope.companies.value.map(item => ({value: item.id, label: item.name}))" @update:model-value="selectCompany" /></UFormGroup></CompanyControlPlacement>
    </div>
    <div class="px-4 sm:px-6 mt-4 overflow-x-auto border-b border-gray-200 dark:border-gray-800"><UHorizontalNavigation :links="links" /></div>
    <AccountSettings v-if="section === 'accounts'" :key="`accounts:${scope.companyId.value}`" />
    <Suspense v-else-if="section === 'printer'"><PrinterSettings :key="`printer:${scope.companyId.value}`" /><template #fallback><p class="p-6 text-sm text-gray-500">Loading printer settings...</p></template></Suspense>
    <Suspense v-else-if="section === 'numbering'"><NumberingSettings :key="`numbering:${scope.companyId.value}`" /><template #fallback><p class="p-6 text-sm text-gray-500">Loading numbering settings...</p></template></Suspense>
    <UDashboardPanelContent v-else class="space-y-4"><div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="item in preferenceOptions" :key="item.key"><h2 class="font-semibold">{{ item.title }}</h2><p class="text-sm text-gray-500 mt-2 mb-4">{{ item.description }}</p><UButton variant="outline" @click="preference = item.key">Open preferences</UButton></UCard>
    </div><p class="text-xs text-gray-500">Changes use the same saved settings as the sales, invoice, quote and sales-order pages.</p></UDashboardPanelContent>
    <BillingPreferences v-if="billingOpen" v-model="billingOpen" :document="preference === 'invoice' ? 'invoice' : 'sale'" :company-id="scope.companyId.value" :company-name="scope.companyName(scope.companyId.value)" />
    <QuotePreferences v-if="quoteOpen" :key="preference || 'quote'" v-model="quoteOpen" :document-kind="preference === 'sales-order' ? 'sales-order' : 'quote'" />
</div></template>
