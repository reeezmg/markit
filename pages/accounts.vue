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
            <UDashboardNavbar title="Legacy Accounts">
            </UDashboardNavbar>
            <UAlert class="m-4" title="Read-only accounting history" description="Source changes post to Accountant. These historical ledgers no longer receive updates." />
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
