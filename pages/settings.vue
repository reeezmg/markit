<script setup lang="ts">
definePageMeta({
    auth: true,
});
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
    ],
]);
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Settings" />
            <UDashboardToolbar class="py-0 px-1.5 overflow-x-auto">
                <UHorizontalNavigation :links="links" />

            </UDashboardToolbar>
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
