<script setup lang="ts">
definePageMeta({
    auth: true,
});
const scope = useCompanyScope('form');
const route = useRoute();
const router = useRouter();
await scope.ready;
const selectedCompany = computed(() => typeof route.query.entryCompany === 'string'
    ? route.query.entryCompany : scope.companyId.value);
const companyOptions = computed(() => scope.companies.value.map(company => ({ label: company.name, value: company.id })));
async function selectCompany(id: string) {
    if (!scope.companies.value.some(company => company.id === id)) return;
    await router.push({ path: route.path, query: { ...route.query, entryCompany: id } });
}
const { data: companyStructure } = await useFetch<{ parentCompanyId: string | null }>('/api/branches');
const links = computed(() => [
    [
        {
            label: 'General',
            icon: 'i-heroicons-user-circle',
            to: '/settings',
            exact: true,
        },
        {
            label: 'Store',
            icon: 'i-heroicons-banknotes',
            to: '/settings/store',
        },
        ...(companyStructure.value?.parentCompanyId === null ? [{
            label: 'Company & Branches',
            icon: 'i-heroicons-building-office-2',
            to: '/settings/branches',
        }] : []),
        {
            label: 'Products',
            icon: 'i-heroicons-squares-2x2',
            to: '/settings/products',
        },
        { label: 'Account', icon: 'i-heroicons-book-open', to: '/settings/account' },
        {
            label: 'Printer',
            icon: 'i-heroicons-printer',
            to: '/settings/printer',
        },
        {
            label: 'Numbering',
            icon: 'i-heroicons-hashtag',
            to: '/settings/numbering',
        },
        {
            label: 'Requests',
            icon: 'i-heroicons-arrow-path-rounded-square',
            to: '/settings/requests',
        }
    ].map(link => ({ ...link, to: { path: link.to,
        query: link.to === '/settings/branches' ? {} : { entryCompany: selectedCompany.value } } })),
]);
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <ErpPageNavbar title="Settings" />
            <div v-if="scope.enabled.value && route.path !== '/settings/branches'" class="px-4 py-3 sm:px-6">
                <CompanyControlPlacement toolbar>
                <UFormGroup size="xs">
                    <USelect aria-label="Company / branch" :model-value="selectedCompany" :options="companyOptions" class="max-w-sm" @update:model-value="selectCompany" />
                </UFormGroup>
                </CompanyControlPlacement>
                <p class="mt-1 text-sm text-gray-500">Company settings apply to the selected company. Your login stays in head office.</p>
                <p v-if="route.path === '/settings'" class="mt-1 text-sm text-gray-500">Your display name is company-specific. Email, password and profile image belong to your user account.</p>
            </div>
            <UDashboardToolbar class="py-0 px-1.5 overflow-x-auto">
                <UHorizontalNavigation :links="links" />

            </UDashboardToolbar>
            <NuxtPage :key="`${route.path}:${selectedCompany}`" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
