<script setup lang="ts">
const companyScope = useCompanyScope('form');
await companyScope.ready;
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
            <ErpPageNavbar title="Legacy Accounts">
            </ErpPageNavbar>
            <UAlert class="m-4" title="Read-only accounting history" description="Source changes post to Accountant. These historical ledgers no longer receive updates." />
            <CompanyFormField toolbar />
            <NuxtPage :key="companyScope.companyId.value" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
