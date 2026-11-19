<script setup lang="ts">
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
const route = useRoute();
definePageMeta({
    auth: true,
});
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <ErpPageNavbar :title="route.query.from === 'crm' ? 'Clients / leads' : 'Client'">

            </ErpPageNavbar>
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
