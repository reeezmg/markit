<script setup lang="ts">
import { useFindManyVariant } from '~/lib/hooks';

definePageMeta({
  auth: false,
  layout: 'store',
});

useHead({
  title: 'Wishlist Page',
});

const useClientAuth = () => useNuxtApp().$authClient;
const router = useRoute();
const cartStore = useCartStore();
const likeStore = useLikeStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const likeItemCount = computed(() => likeStore.likedCount);
const variantIds = computed(() => likeStore.likedItems.map((item) => item.variantId));
const isOpen = ref(false);
const queryArgs = computed(() => ({
  where: {
    id: {
      in: variantIds.value,
    },
  },
  select: {
    id: true,
    images: true,
    pprice: true,
    sizes: true,
    product: {
      select: {
        id: true,
        name: true,
      },
    },
  },
}));

const {
  data: variants,
  isLoading,
  error,
  refetch,
} = useFindManyVariant(queryArgs);


</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Wishlist" >
        <template #right>
                <div class="flex flex-row items-end justify-end">
                <UButton v-if="useClientAuth().session.value?.type === 'USER' || !useClientAuth().session.value?.id" @click="isOpen = true"
                    class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                    Login
                </UButton>
                <UTooltip class="me-3 " text="Cart" :shortcuts="['C']">
                    <NuxtLink
                        :to="`./checkout`"
                    >
                        <UChip :text="cartItemCount" color="red" size="2xl">
                            <UIcon
                                name="i-heroicons-shopping-cart"
                                class="w-5 h-5"
                            />
                        </UChip>
                    </NuxtLink>
                </UTooltip>
                <UTooltip class="me-3" text="Wishlist" :shortcuts="['W']">
                    <NuxtLink
                        :to="`./wishlist`"
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

      <UDashboardPanelContent>
        <div v-if="isLoading" class="text-center text-gray-500">Loading...</div>
        <div v-else-if="!variants?.length" class="text-center text-gray-400">No liked items found.</div>

        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
        >
          <ProductsVariantCard
            v-for="(item, index) in variants"
            :key="item.id"
            :info="item"
            :index="index"
          />
        </div>
      </UDashboardPanelContent>
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
