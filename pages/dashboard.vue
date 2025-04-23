<script setup lang="ts">
import NotificationIcon from '~/components/NotificationIcon.vue'
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Dashboard">
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
