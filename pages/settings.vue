<script setup lang="ts">
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
       
    ],
];
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Settings" />
            <UDashboardToolbar class="py-0 px-1.5 overflow-x-auto">
                <UHorizontalNavigation :links="links" />
                                <template #right>

                    <ClientOnly>
        <NotificationIcon />
      </ClientOnly>

                </template>
            </UDashboardToolbar>
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
