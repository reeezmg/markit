<script setup lang="ts">
import { useFindManyVariant } from '~/lib/hooks'

const route = useRoute()
const router = useRouter()
const likeStore = useLikeStore()
const cartStore = useCartStore()
const auth = useClientAuth()
const isOpen = ref(false)
const toast = useToast()
const removingId = ref<string | null>(null)

definePageMeta({
  auth: false,
  layout: 'store',
})

const companyName = computed(() => {
  return Array.isArray(route.params.company) 
    ? route.params.company[0] 
    : route.params.company || ''
})

const locallyRemovedIds = ref<Set<string>>(new Set())

const effectiveLikedIds = computed(() => 
  likeStore.likedItems
    .map(item => item.variantId)
    .filter(id => !locallyRemovedIds.value.has(id))
)

const { 
  data: variants, 
  isLoading, 
  error, 
  refetch 
} = useFindManyVariant({
  where: computed(() => ({
    id: { in: effectiveLikedIds.value },
    product: { 
      company: { name: { equals: companyName.value } },
      status: true 
    }
  })).value,
  include: {
    product: {
      include: {
        company: true,
        variants: { select: { id: true } }
      }
    },
  }
})

const processVariant = (variant: any) => ({
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
})

const processedVariants = computed(() => {
  if (!variants.value) return []
  return variants.value
    .filter(variant => !locallyRemovedIds.value.has(variant.id))
    .map(processVariant)
})

const cartItemCount = computed(() => cartStore.cartItemCount)
const navigateToStore = () => router.push(`/store/${companyName.value}`)

const removeFromWishlist = async (variantId: string) => {
  removingId.value = variantId
  locallyRemovedIds.value.add(variantId)
  
  try {
    await likeStore.removeLike({ variantId })
    const wasRemoved = !likeStore.likedItems.some(item => item.variantId === variantId)
    
    if (!wasRemoved) throw new Error('Item was not removed from store')
    
    toast.add({ 
      title: 'Removed from wishlist', 
      color: 'red', 
      icon: 'i-heroicons-heart',
      timeout: 2000
    })
  } catch (error) {
    locallyRemovedIds.value.delete(variantId)
    await refetch()
    toast.add({
      title: 'Error',
      description: 'Failed to remove item',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
  } finally {
    removingId.value = null
  }
}

watch(
  () => likeStore.likedItems,
  (newItems) => {
    const currentIds = new Set(newItems.map(item => item.variantId))
    locallyRemovedIds.value.forEach(id => {
      if (currentIds.has(id)) {
        locallyRemovedIds.value.delete(id)
      }
    })
  },
  { deep: true }
)
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Your Wishlist">
        <template #right>
          <div class="flex items-center gap-3">
            <UButton 
              v-if="!auth.session?.value?.id"
              @click="isOpen = true"
              size="md"
              color="primary"
              label="Sign In"
              icon="i-heroicons-user"
              class="hidden sm:inline-flex"
            />
            
            <!-- Cart Button with Badge -->
            <div class="relative">
              <UButton
                color="gray"
                variant="ghost"
                aria-label="Shopping Cart"
                :to="`/store/${companyName}/checkout`"
                class="p-2"
              >
                <UIcon name="i-heroicons-shopping-cart" class="w-5 h-5" />
              </UButton>
              <span 
                v-if="cartItemCount > 0"
                class="absolute -top-1 -right-1 bg-primary-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center"
              >
                {{ cartItemCount }}
              </span>
            </div>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent class="pb-12 px-4 sm:px-6">
        <!-- Breadcrumbs -->
        <div class="mb-6">
          <UBreadcrumb
            :links="[
              
              { label: 'Store', to: `/store/${companyName}` },
              { label: 'Wishlist' }
            ]"
          />
        </div>

        <!-- Page Header -->
        <div class="mb-8 text-center">
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Your Wishlist
          </h1>
          <p class="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Saved items you love
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          <div v-for="n in 8" :key="n" class="animate-pulse">
            <div class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-3/4"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-3 w-1/2"></div>
            <div class="h-9 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12 max-w-md mx-auto">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Error loading wishlist</h3>
          <p class="text-gray-500 dark:text-gray-400 mb-6">{{ error.message }}</p>
          <UButton
            @click="refetch()"
            size="md"
            color="primary"
            icon="i-heroicons-arrow-path"
            label="Try Again"
          />
        </div>

        <!-- Empty State -->
        <div 
          v-else-if="!processedVariants.length" 
          class="flex flex-col items-center justify-center py-12 px-4"
        >
          <div class="bg-primary-50 dark:bg-primary-900/20 p-6 rounded-full mb-6">
            <UIcon name="i-heroicons-heart" class="w-12 h-12 text-primary-500 dark:text-primary-400" />
          </div>
          <h3 class="text-xl font-medium text-gray-900 dark:text-gray-100 mb-3">
            Your wishlist is empty
          </h3>
          <p class="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
            Save items you love by clicking the heart icon on products. They'll appear here for easy access.
          </p>
          <UButton
            label="Browse Products"
            size="md"
            color="primary"
            icon="i-heroicons-arrow-right"
            trailing
            @click="navigateToStore"
          />
        </div>

        <!-- Wishlist Items -->
        <div v-else>
          <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
            <p class="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
              {{ processedVariants.length }} {{ processedVariants.length === 1 ? 'item' : 'items' }}
            </p>
            <UButton
              label="Continue Shopping"
              variant="outline"
              color="primary"
              size="md"
              icon="i-heroicons-arrow-left"
              @click="navigateToStore"
              class="flex-shrink-0"
            />
          </div>
          
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            <div 
              v-for="variant in processedVariants"
              :key="variant.id"
              class="relative transition-all hover:shadow-lg hover:-translate-y-1"
              :class="{ 'opacity-50': removingId === variant.id }"
            >
              <ProductsVariantCard
                :variant="variant"
                :is-liked="true"
                :is-removing="removingId === variant.id"
                @remove="removeFromWishlist(variant.id)"
                class="h-full transition-opacity duration-300"
              />
            </div>
          </div>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>

  <!-- Login Modal -->
  <UModal v-model="isOpen">
    <UCard>
      <template #header>
        <div class="text-center">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Login to Your Account</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Access your wishlist and shopping cart</p>
        </div>
      </template>
      <div class="p-4">
        <CheckoutLogin @close="isOpen = false" />
      </div>
      <template #footer>
        <div class="text-center text-sm text-gray-500 dark:text-gray-400">
          Don't have an account? 
          <UButton
            variant="link"
            color="primary"
            size="sm"
            label="Sign up"
            @click="router.push('/auth/signup')"
          />
        </div>
      </template>
    </UCard>
  </UModal>
</template>