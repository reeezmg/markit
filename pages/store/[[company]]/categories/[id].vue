<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useFindManyCategory, useFindManyProduct } from '~/lib/hooks'

const route = useRoute()

// State
const category = ref<any>(null)
const categoryProducts = ref<any[]>([])
const isLoading = ref(false)
const error = ref<any>(null)
const page = ref(1)
const pageSize = 12
const loadingMore = ref(false)
const hasMore = ref(true)
const cartStore = useCartStore()
const likeStore = useLikeStore()

// Computed
const flatVariants = computed(() => {
  return categoryProducts.value.flatMap(product => 
    product.variants.map((variant: any) => ({
      ...variant,
      product
    }))
  ) || []
})

definePageMeta({
  auth: false,
  layout: 'store',
})

// Fetch category details
const fetchCategory = async () => {
  try {
    const { data } = await useFindManyCategory({
      where: {
        id: route.params.id as string,
        status: true
      },
      include: {
        company: true,
        products: {
          where: { status: true },
          include: { variants: true },
          take: 1
        }
      }
    })
    
    if (data.value?.[0]) {
      category.value = data.value[0]
    } else {
      throw new Error('Category not found')
    }
  } catch (err) {
    error.value = err
    console.error('Failed to load category:', err)
  }
}

// Fetch products by category
const fetchProductsByCategory = async (categoryId: string, page: number, pageSize: number) => {
  try {
    const { data } = await useFindManyProduct({
      where: {
        category: { id: categoryId },
        status: true,
        variants: { some: { images: { isEmpty: false } } }
      },
      include: {
        company: true,
        variants: true,
        category: true
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' }
    })
    
    return data.value || []
  } catch (err) {
    console.error('Failed to load products:', err)
    return []
  }
}

// Load initial products
const loadInitialProducts = async () => {
  try {
    isLoading.value = true
    error.value = null
    page.value = 1
    hasMore.value = true
    
    const products = await fetchProductsByCategory(route.params.id as string, page.value, pageSize)
    categoryProducts.value = products
    hasMore.value = products.length >= pageSize
  } catch (err) {
    error.value = err
    console.error('Failed to load products:', err)
  } finally {
    isLoading.value = false
  }
}

// Load more products
const loadMore = async () => {
  if (loadingMore.value || !hasMore.value) return
  
  loadingMore.value = true
  
  try {
    const newProducts = await fetchProductsByCategory(
      route.params.id as string, 
      page.value + 1, 
      pageSize
    )
    
    if (newProducts.length > 0) {
      page.value += 1
      categoryProducts.value = [...categoryProducts.value, ...newProducts]
    }
    hasMore.value = newProducts.length >= pageSize
  } catch (err) {
    console.error('Failed to load more products:', err)
  } finally {
    loadingMore.value = false
  }
}

// Infinite scroll handler
const handleScroll = useDebounceFn(() => {
  const scrollPosition = window.innerHeight + window.scrollY
  const pageHeight = document.documentElement.scrollHeight - 500
  
  if (scrollPosition >= pageHeight && !loadingMore.value) {
    loadMore()
  }
}, 200)

// Retry mechanism
const retryLoad = async () => {
  error.value = null
  await Promise.all([fetchCategory(), loadInitialProducts()])
}

// Lifecycle
onMounted(async () => {
  window.addEventListener('scroll', handleScroll)
  await Promise.all([fetchCategory(), loadInitialProducts()])
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

useHead({
  title: computed(() => category.value ? `${category.value.name} Category` : 'Category')
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar :title="category?.name || 'Category'">
        <template #right>
          <div class="flex flex-row items-end justify-end">
            <UButton 
              v-if="!$authClient.session.value?.id" 
              @click="$authClient.updateSession()"
              class="px-5 me-3 flex items-center justify-center rounded-md border border-transparent text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              Login
            </UButton>
            <UTooltip class="me-3" text="Cart" :shortcuts="['C']">
              <NuxtLink to="/checkout">
                <UChip :text="cartStore.cartItemCount" color="red" size="2xl">
                  <UIcon name="i-heroicons-shopping-cart" class="w-5 h-5" />
                </UChip>
              </NuxtLink>
            </UTooltip>
            <UTooltip class="me-3" text="Wishlist" :shortcuts="['W']">
              <NuxtLink to="/wishlist">
                <UChip :text="likeStore.likedCount" color="red" size="2xl">
                  <UIcon name="i-heroicons-heart" class="w-5 h-5" />
                </UChip>
              </NuxtLink>
            </UTooltip>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Loading state -->
        <div v-if="isLoading && !category" class="w-full flex justify-center my-12">
          <UButton
            loading
            color="primary"
            variant="ghost"
            label="Loading category..."
          />
        </div>
        
        <!-- Error state -->
        <div v-else-if="error" class="w-full text-center py-12">
          <UAlert
            title="Failed to load category"
            :description="error.message || String(error)"
            color="red"
            variant="solid"
            icon="i-heroicons-exclamation-triangle"
            class="mb-4"
          />
          <UButton
            @click="retryLoad"
            color="primary"
            label="Retry"
          />
        </div>
        
        <!-- Content -->
        <template v-else>
          <div v-if="category" class="mb-8">
            <h1 class="text-3xl font-bold mb-2">{{ category.name }}</h1>
            <p v-if="category.description" class="text-gray-600 dark:text-gray-400 max-w-3xl">
              {{ category.description }}
            </p>
            
            <!-- Category placeholder image or icon -->
            <div class="mt-6 w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
              <UIcon name="i-heroicons-tag" class="w-20 h-20 text-gray-400" />
            </div>
          </div>

          <div v-if="flatVariants.length > 0">
            <h2 class="text-xl font-semibold mb-4">
              {{ categoryProducts.length }} products available
            </h2>
            
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <ProductsProductCard
                v-for="(variant, index) in flatVariants"
                :key="variant.id"
                :variant="variant"
                :index="index"
              />
            </div>
          </div>
          
          <div v-else-if="!isLoading" class="w-full text-center py-12 text-gray-500 dark:text-gray-400">
            <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 mx-auto mb-4" />
            <p class="text-lg">No products found in this category</p>
            <UButton
              to="/"
              color="gray"
              variant="ghost"
              label="Back to Store"
              class="mt-4"
            />
          </div>
          
          <div v-if="loadingMore" class="w-full flex justify-center my-8">
            <UButton
              loading
              color="primary"
              variant="ghost"
              label="Loading more products..."
            />
          </div>
          
          <div v-if="!hasMore && flatVariants.length > 0" class="w-full text-center py-8 text-gray-500 dark:text-gray-400">
            You've reached the end of products in this category
          </div>
        </template>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>