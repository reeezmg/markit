<script setup lang="ts">
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
definePageMeta({
    auth: true,
});
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Product" />

            <NuxtPage :page-key="route => route.path + String(route.query.entryCompany || '')" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
