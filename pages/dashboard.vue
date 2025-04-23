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
                    
                    <!-- <UTooltip text="Cart" :shortcuts="['C']">
                        <NuxtLink
                            :to="`/${auth.session.value?.companyId}/checkout`"
                        >
                            <UChip :text="cartItemCount" color="red" size="2xl">
                                <UIcon
                                    name="i-heroicons-shopping-cart"
                                    class="w-5 h-5"
                                />
                            </UChip>
                        </NuxtLink>
                    </UTooltip> -->
                    <ClientOnly>
        <NotificationIcon />
      </ClientOnly>

                </template>
            </UDashboardNavbar>
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
