<script setup lang="ts">
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
const companyScope = useCompanyScope('form');
const route = useRoute();
if (typeof route.query.entryCompany === 'string') await companyScope.selectOwner(route.query.entryCompany);
definePageMeta({
    auth: true,
});
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <ErpPageNavbar title="Dashboard">

            </ErpPageNavbar>
            <CompanyFormField toolbar />
            <NuxtPage :key="companyScope.companyId.value" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
