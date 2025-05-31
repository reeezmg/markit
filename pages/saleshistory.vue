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
            <UDashboardNavbar title="Bill History">
                <template #right>

<ClientOnly>
<NotificationIcon />
</ClientOnly>

</template>
            </UDashboardNavbar>
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
