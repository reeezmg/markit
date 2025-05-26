<script setup lang="ts">
import { useFindManyVariant } from '~/lib/hooks'
import type { WishlistVariant } from '~/types/store'

const route = useRoute()
const router = useRouter()
const likeStore = useLikeStore()
const cartStore = useCartStore()
const auth = useClientAuth()
const isOpen = ref(false)
const toast = useToast()



definePageMeta({
  auth: false,
  layout: 'store',
})

const companyName = computed(() => {
  return Array.isArray(route.params.company) 
    ? route.params.company[0] 
    : route.params.company || ''
})

// Client-side only data fetching
const { data: variants, pending, refresh } = useAsyncData<WishlistVariant[]>(
  'wishlist-items',
  async () => {

    
    const variantIds = likeStore.likedItems.map(item => item.variantId)
    if (variantIds.length === 0) return []

    const { data } = await useFindManyVariant({
      where: { 
        id: { in: variantIds },
        product: { 
          company: { name: { equals: companyName.value } },
          status: true 
        }
      },
      include: {
        product: {
          include: {
            company: true,
            variants: { select: { id: true } }
          }
        },
      }
    })

    return data.value?.map(variant => ({
      ...variant,
      product: {
        id: variant.product.id,
        name: variant.product.name,
        description: variant.product.description,
        company: variant.product.company,
        variants: variant.product.variants
      },
      availableQty: variant.qty || 0,
      isOutOfStock: (variant.qty || 0) <= 0,
      mainImage: variant.images?.[0] ? `https://images.markit.co.in/${variant.images[0]}` : null
    })) || []
  },
  {
    server: false,
    watch: [() => likeStore.likedItems],
    immediate: true
  }
)


const cartItemCount = computed(() => cartStore.cartItemCount)

const navigateToStore = () => router.push(`/store/${companyName.value}`)

const removeFromWishlist = async (variantId: string) => {
  try {
    await likeStore.removeLike({ variantId })
    toast.add({ 
      title: 'Removed from wishlist', 
      color: 'red', 
      icon: 'i-heroicons-heart',
      timeout: 2000
    })
  } catch (error) {
    toast.add({
      title: 'Error',
      description: 'Failed to remove item',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
  }
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Your Wishlist">
        <template #right>
          <div class="flex items-center gap-4">
            <UButton 
              v-if="!auth.session?.value?.id"
              @click="isOpen = true"
              class="px-5"
              size="md"
            >
              Login
            </UButton>
            <NuxtLink 
              :to="`/store/${companyName}/checkout`" 
              class="relative inline-flex items-center"
            >
              <UIcon 
                name="i-heroicons-shopping-cart" 
                class="w-6 h-6 text-gray-700 dark:text-gray-300" 
              />
              <span 
                v-if="cartItemCount > 0"
                class="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center"
              >
                {{ cartItemCount }}
              </span>
            </NuxtLink>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent class="pb-12">
        <!-- Liked Items Count (separate section) -->
        <div v-if="!pending" class="mb-6 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Saved Items
          </h2>
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ variants?.length || 0 }} items
          </span>
        </div>

        <!-- Empty State -->
        <div 
          v-if="!pending && variants?.length === 0" 
          class="flex flex-col items-center justify-center py-12"
        >
          <UIcon name="i-heroicons-heart" class="w-16 h-16 text-gray-400 mb-4" />
          <h3 class="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">
            Your wishlist is empty
          </h3>
          <p class="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
            Save items you love by clicking the heart icon on products
          </p>
          <UButton
            label="Continue Shopping"
            size="md"
            variant="solid"
            @click="navigateToStore"
          />
        </div>

        <!-- Loading State -->
        <div v-else-if="pending" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          <div v-for="n in 8" :key="n" class="animate-pulse">
            <div class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-3/4"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-3 w-1/2"></div>
            <div class="h-9 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>

        <!-- Wishlist Items -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          <div 
            v-for="variant in variants"
            :key="variant.id"
            class="relative transition-all"
          >
            <ProductsVariantCard
              :variant="variant"
              :is-liked="true"
              @remove="removeFromWishlist(variant.id)"
              class="h-full"
            />
          </div>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>

  <!-- Login Modal -->
  <UModal v-model="isOpen">
    <UCard>
      <template #header>
        <div class="font-semibold text-center text-lg">Login to continue</div>
      </template>
      <div class="p-4">
        <CheckoutLogin @close="isOpen = false" />
      </div>
    </UCard>
  </UModal>
</template>