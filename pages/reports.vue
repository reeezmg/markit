<script setup lang="ts">
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
const companyScope = useCompanyScope('form');
const route = useRoute();
if (typeof route.query.entryCompany === 'string') await companyScope.selectOwner(route.query.entryCompany);
const singleCompanyReport = computed(() => !['/reports/profit', '/reports/accounts', '/reports/online'].includes(route.path));
definePageMeta({
    auth: true,
});
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <ErpPageNavbar title="Reports">

            </ErpPageNavbar>
            <CompanyFormField v-if="singleCompanyReport" toolbar />
            <NuxtPage :key="`${companyScope.companyId.value}:${route.path}`" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
