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
            <ErpPageNavbar title="Users">

            </ErpPageNavbar>

            <NuxtPage :key="auth.session.value?.companyId" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
