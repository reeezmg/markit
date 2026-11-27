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
    <NuxtPage v-if="route.meta.documentDesigner" :page-key="route => route.path + String(route.query.entryCompany || '')" />
    <UDashboardPage v-else>
        <UDashboardPanel grow>
            <ErpPageNavbar title="Sales" />

            <NuxtPage :page-key="route => route.path + String(route.query.entryCompany || '')" />
        </UDashboardPanel>
    </UDashboardPage>
</template>
