<script setup lang="ts">
const cartStore = useCartStore();
const likeStore = useLikeStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const likeItemCount = computed(() => likeStore.likedCount);
const useAuth = () => useNuxtApp().$authClient;
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const isOpen = ref(false);
const useClientAuth = () => useNuxtApp().$authClient;
useHead({
    title: 'Product',
});
definePageMeta({
    auth: false,
    layout: 'store',
});

</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Product">
                <template #right>
                    <div class="flex flex-row items-end justify-end">
                    <UButton  v-if="useClientAuth().session.value?.type === 'USER' || !useClientAuth().session.value?.id"  @click="isOpen = true"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Login
                    </UButton>
<UTooltip class="me-3" text="Cart" :shortcuts="['C']">
  <NuxtLink :to="formatStoreRoute(route.params.company, 'checkout')">
    <ClientOnly>
      <UChip :text="cartItemCount" color="red" size="2xl">
        <UIcon name="i-heroicons-shopping-cart" class="w-5 h-5" />
      </UChip>
    </ClientOnly>
  </NuxtLink>
</UTooltip>
                    <UTooltip class="me-3" text="Wishlist" :shortcuts="['W']">
                        <NuxtLink
                            :to="`../wishlist`"
                        >
                            <UChip :text="likeItemCount" color="red" size="2xl">
                                <UIcon
                                    name="i-heroicons-heart"
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
    <UModal v-model="isOpen">
    <UCard>
    <template #header>
        <div class="font-semibold text-center">Login</div>
    </template>
    <div class="p-4">
        <CheckoutLogin @close="isOpen = false"/>
    </div>
    </UCard>
    </UModal>
</template>
