<script setup lang="ts">
definePageMeta({
    auth: true,
});
const links = [
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
        {
            label: 'Printer',
            icon: 'i-heroicons-printer',
            to: '/settings/printer',
        }
    ],
];
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
