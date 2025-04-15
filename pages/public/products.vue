<script setup lang="ts">
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$authClient;
const auth = useAuth();
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Product">
                <template #right>
                    <div class="flex flex-row items-center justify-center">
                    <UButton @click="()=>router.push('/login')"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Login
                    </UButton>
                    <UTooltip class="" text="Notifications" :shortcuts="['N']">
                        <NuxtLink
                            :to="`/checkouts`"
                        >
                            <UChip :text="cartItemCount" color="red" size="2xl">
                                <UIcon
                                    name="i-heroicons-shopping-cart"
                                    class="w-5 h-5"
                                />
                            </UChip>
                        </NuxtLink>
                    </UTooltip>
                </div>
                </template>
            </UDashboardNavbar>

            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
