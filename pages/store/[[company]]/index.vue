<script setup lang="ts">
import type { VariantWithProduct } from '~/types/store'
import type { CartItem } from '~/types/cart'
import { useCartInitializer } from '~/composables/useCartInitializer'

// Lazy load hooks to ensure client-side only
const { useFindManyProduct, useFindManyCategory } = await import('~/lib/hooks')

definePageMeta({
  auth: false,
  layout: 'store',
})

useHead({ 
  title: 'Store Home',
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@700&display=swap' }
  ]
})

// Initialization
const route = useRoute()
const router = useRouter()
const cartStore = useCartStore()
const likeStore = useLikeStore()
const toast = useToast()

// State
const search = ref('')
const sortOrder = ref('newest')
const selectedCategory = ref<any>(null)
const priceRange = ref<[number, number]>([0, 50000])
const discountRange = ref<[number, number]>([0, 100])
const inStockOnly = ref(false)
const selectedSizes = ref<string[]>([])
const page = ref(1)
const pageSize = 12
const loadingMore = ref(false)
const hasMore = ref(true)
const categories = ref<any[]>([])
const showQuickView = ref(false)
const quickViewProduct = ref<any>(null)
const isVisible = ref<boolean[]>([])

// Mobile UI
const isMobileFiltersOpen = ref(false)
const isMobileMenuOpen = ref(false)

// Sort options
const sortOptions = ref([
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' }
])

// Helper functions
const getCompanyName = (): string => {
  if (!route.params.company) return ''
  return Array.isArray(route.params.company) ? route.params.company[0] : route.params.company
}

useCartInitializer(getCompanyName());

//Query Arguments
const getQueryArgs = () => {
  const companyName = getCompanyName()
  
  const baseConditions: any[] = [
    { status: true },
    { company: { name: { equals: companyName || '' } } },
    { variants: { some: { images: { isEmpty: false } } } }
  ]

  if (search.value) baseConditions.push({ name: { contains: search.value } })
  if (selectedCategory.value) baseConditions.push({ category: { id: selectedCategory.value.id } })
  if (inStockOnly.value) baseConditions.push({ variants: { some: { items: { some: { status: 'in_stock' } } } }})

  // Price range filter - simplified approach
  baseConditions.push({
    variants: {
      some: {
        OR: [
          { 
            AND: [
              { dprice: { not: null } },
              { dprice: { gte: priceRange.value[0], lte: priceRange.value[1] } }
            ]
          },
          { 
            AND: [
              { dprice: null },
              { sprice: { gte: priceRange.value[0], lte: priceRange.value[1] } }
            ]
          }
        ]
      }
    }
  })

  // Discount filter - simplified to only use explicit discount field
  if (discountRange.value[0] > 0 || discountRange.value[1] < 100) {
    baseConditions.push({
      variants: {
        some: {
          discount: { 
            not: null,
            gte: discountRange.value[0], 
            lte: discountRange.value[1] 
          }
        }
      }
    })
  }

  let orderBy = {}
  switch (sortOrder.value) {
    case 'price-low':
    orderBy = { createdAt: 'desc' }
      break
    case 'price-high':
    orderBy = { createdAt: 'desc' }
      break
    default:
      orderBy = { createdAt: 'desc' }
  }

  return {
    where: { AND: baseConditions },
    include: {
      company: true,
      variants: {
        include: {
          items: {
            where: { status: 'in_stock' },
            select: { id: true }
          }
        }
      },
      category: true
    },
    skip: (page.value - 1) * pageSize,
    take: pageSize,
    orderBy
  }
}

const queryArgs = computed(() => getQueryArgs())

// Product queries
const { 
  data: productsData, 
  isLoading, 
  error,
  refetch
} = useFindManyProduct(queryArgs)

const { data: trendingData } = useFindManyProduct({
  where: {
    AND: [
      { status: true },
      { company: { name: { equals: getCompanyName() } } },
      { variants: { some: { images: { isEmpty: false } } } }
    ]
  },
  include: { 
    company: true, 
    variants: {
      include: {
        items: {
          where: { status: 'in_stock' },
          select: { id: true }
        }
      }
    } 
  },
  take: 8,
  orderBy: { createdAt: 'desc' }
})

const { data: categoriesData } = useFindManyCategory({
  where: { 
    company: { name: { equals: getCompanyName() } },
    status: true 
  },
  include: {
    products: {
      where: { status: true },
      include: { 
        variants: {
          include: {
            items: {
              where: { status: 'in_stock' },
              select: { id: true }
            }
          }
        } 
      },
      take: 4
    }
  }
})

// Reactive data
const allProducts = computed(() => productsData.value || [])
const trendingProducts = computed(() => trendingData.value || [])
const allCategories = computed(() => categoriesData.value || [])


// Enhanced flat variants with client-side sorting ONLY
const flatVariants = computed(() => {
  let variants = allProducts.value.flatMap(product =>
    product.variants.map((variant: any) => ({
      ...variant,
      product,
      availableQty: variant.items?.length || 0,
      isOutOfStock: (variant.qty || 0) <= 0, // Add out-of-stock flag
      mainImage: variant.images?.[0] ? `https://unifeed.s3.ap-south-1.amazonaws.com/${variant.images[0]}` : null,
      discountPercentage: variant.discount || 
        (variant.dprice && variant.sprice ? 
          Math.round((1 - variant.dprice / variant.sprice) * 100) : 0)
    }))
  ) || []

  // Client-side discount filter if needed
  variants = variants.filter(variant => {
    const discount = variant.discountPercentage
    return discount >= discountRange.value[0] && discount <= discountRange.value[1]
  })

  // Client-side sorting
  let sortedVariants = variants.slice()
  switch (sortOrder.value) {
    case 'price-low':
      sortedVariants.sort((a, b) => (a.dprice || a.sprice || 0) - (b.dprice || b.sprice || 0))
      break
    case 'price-high':
      sortedVariants.sort((a, b) => (b.dprice || b.sprice || 0) - (a.dprice || a.sprice || 0))
      break
    default:
      // Default sort by newest (createdAt)
      sortedVariants.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Move out-of-stock items to end while preserving their sort order
  return [
    ...sortedVariants.filter(v => !v.isOutOfStock), // In-stock items first
    ...sortedVariants.filter(v => v.isOutOfStock)   // Out-of-stock items last
  ]
})

const trendingVariants = computed<VariantWithProduct[]>(() => {
  return trendingProducts.value.flatMap(product => 
    product.variants.filter(variant => (variant.qty || 0) > 0).map((variant: any) => ({
      ...variant,
      product,
      availableQty: variant.items?.length || 0,
      mainImage: variant.images?.[0] ? `https://unifeed.s3.ap-south-1.amazonaws.com/${variant.images[0]}` : null
    }))
  ) || []
})

// Load more function
const loadMore = async () => {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  page.value += 1
  try {
    await refetch()
  } finally {
    loadingMore.value = false
  }
}

// Watch for changes
watch(productsData, (newData) => {
  if (!newData) return
  hasMore.value = newData.length >= pageSize
})

// Watch flatVariants and initialize visibility state
watch(flatVariants, (newVariants) => {
  // Reset visibility state when variants change
  isVisible.value = new Array(newVariants.length).fill(false)
  
  // Trigger visibility check for all items after a small delay
  nextTick(() => {
    newVariants.forEach((_, index) => {
      handleIntersection(index)
    })
  })
}, { immediate: true })

// Watch for filter changes and reset pagination
watch([search, selectedCategory, inStockOnly, priceRange, discountRange], () => {
  page.value = 1
  hasMore.value = true
  loadingMore.value = false
  refetch()
}, { deep: true })

// Filter logic
const filterByCategory = (category: any) => {
  selectedCategory.value = category
  page.value = 1
}

const clearCategoryFilter = () => {
  selectedCategory.value = null
  page.value = 1
}

const clearAllFilters = () => {
  search.value = ''
  selectedCategory.value = null
  priceRange.value = [0, 50000]
  discountRange.value = [0, 100]
  inStockOnly.value = false
  selectedSizes.value = []
  page.value = 1
  hasMore.value = true
  loadingMore.value = false
  // Force a complete refresh
  productsData.value = []
  refetch()
}

// Quick view
const openQuickView = (variant: VariantWithProduct) => {
  quickViewProduct.value = {
    ...variant,
    mainImage: variant.images?.[0] ? `https://unifeed.s3.ap-south-1.amazonaws.com/${variant.images[0]}` : null
  }
  showQuickView.value = true
}

const toggleLikeInQuickView = (variant: VariantWithProduct) => {
  const likedItem = { variantId: variant.id }
  const isLiked = likeStore.toggleLike(likedItem) ?? false

  toast.add({
    title: isLiked ? 'Liked' : 'Unliked',
    description: isLiked
      ? `${variant.product.name} added to your likes.`
      : `${variant.product.name} removed from your likes.`,
    color: isLiked ? 'primary' : 'red',
    icon: isLiked ? 'i-heroicons-heart-solid' : 'i-heroicons-heart',
  })
}

const addToCartFromQuickView = async (variant: VariantWithProduct) => {
  const qty = variant.qty ?? 0
  if (qty === 0) {
    toast.add({
      title: 'Out of Stock',
      description: 'This product is currently out of stock',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
    return
  }

  const companyId = variant.companyId
  await cartStore.addToCart(
    { variantId: variant.id, size: null, qty: 1 } as CartItem,
    companyId
  )

  showQuickView.value = false
  toast.add({
    title: 'Added to Cart',
    description: `${variant.product.name} added to your cart.`,
    color: 'green',
    icon: 'i-heroicons-check-circle',
    timeout: 2000,
    actions: [{
      label: 'View Cart',
      click: () => router.push(`${route.fullPath.replace(/\/$/, '')}/checkout`)
    }]
  })
}

// Scroll handler
const handleScroll = useDebounceFn(() => {
  const scrollPosition = window.innerHeight + window.scrollY
  const pageHeight = document.documentElement.scrollHeight - 500
  if (scrollPosition >= pageHeight && !loadingMore.value) loadMore()
}, 200)

const handleIntersection = (index: number) => {
  nextTick(() => {
    const element = document.querySelector(`[data-index="${index}"]`)
    if (!element) return

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Immediately set to visible without delay for testing
          isVisible.value[index] = true
          observer.unobserve(entry.target)
        }
      })
    }, { 
      threshold: 0.1,
      rootMargin: '0px 0px 100px 0px' // Trigger slightly before element is in view
    })

    observer.observe(element)
    
    // Fallback: Set to visible after 1 second if observer fails
    setTimeout(() => {
      if (!isVisible.value[index]) {
        isVisible.value[index] = true
      }
    }, 1500)
  })
}

// Add this to your script setup
const parseSizes = (sizes: unknown): { size: string; qty: number }[] => {
  if (Array.isArray(sizes)) {
    return sizes.map(size => ({
      size: size.size || size,
      qty: size.qty || 0
    }))
  }
  return []
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar :title="getCompanyName()">
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
              <NuxtLink :to="`${route.fullPath}/checkout`">
                <UChip :text="cartStore.cartItemCount" color="red" size="2xl">
                  <UIcon name="i-heroicons-shopping-cart" class="w-5 h-5" />
                </UChip>
              </NuxtLink>
            </UTooltip>
            <UTooltip class="me-3" text="Wishlist" :shortcuts="['W']">
              <NuxtLink :to="`${route.fullPath}/wishlist`">
                <UChip :text="likeStore.likedCount" color="red" size="2xl">
                  <UIcon name="i-heroicons-heart" class="w-5 h-5" />
                </UChip>
              </NuxtLink>
            </UTooltip>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <template #left>
          <UButton
            icon="i-heroicons-bars-3"
            color="gray"
            variant="ghost"
            class="md:hidden mr-2"
            @click="isMobileMenuOpen = !isMobileMenuOpen"
          />
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            placeholder="Search products..."
            trailing
            class="w-full md:w-64"
            @keyup.enter="page = 1"
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="gray"
                variant="link"
                icon="i-heroicons-x-mark-20-solid"
                :padded="false"
                @click="search = ''; page = 1"
              />
            </template>
          </UInput>
        </template>

        <template #right>
          <div class="hidden md:flex items-center gap-2">
            <USelectMenu
              v-model="sortOrder"
              :options="sortOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Sort"
              class="w-32"
            />
            
            <UButton
              v-if="selectedCategory"
              color="gray"
              variant="soft"
              @click="clearCategoryFilter"
            >
              Clear
            </UButton>

            <UButton
              icon="i-heroicons-funnel"
              color="gray"
              variant="ghost"
              @click="isMobileFiltersOpen = true"
            >
              Filters
            </UButton>
          </div>

          <UButton
            icon="i-heroicons-funnel"
            color="gray"
            variant="ghost"
            class="md:hidden"
            @click="isMobileFiltersOpen = true"
          />
        </template>
      </UDashboardToolbar>

      <!-- Mobile filters modal -->
      <UModal v-model="isMobileFiltersOpen" :transition="true">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-medium">Filters</h3>
              <UButton
                color="gray"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                @click="isMobileFiltersOpen = false"
              />
            </div>
          </template>

          <div class="space-y-6">
            <!-- Sort options -->
            <div>
              <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Sort By</h4>
              <USelect
                v-model="sortOrder"
                :options="sortOptions"
                option-attribute="label"
                value-attribute="value"
                placeholder="Sort by"
                class="w-full"
              />
            </div>

            <!-- Price Range Filter -->
            <div>
              <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Price Range: ₹{{ priceRange[0] }} - ₹{{ priceRange[1] }}
              </h4>
              <URange 
                v-model="priceRange[0]"
                :min="0"
                :max="50000"
                :step="500"
                class="w-full"
              />
              <URange 
                v-model="priceRange[1]"
                :min="0"
                :max="50000"
                :step="500"
                class="w-full"
              />
            </div>

            <!-- Discount Range Filter -->
            <div>
              <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Discount: {{ discountRange[0] }}% - {{ discountRange[1] }}%
              </h4>
              <URange
                v-model="discountRange[0]"
                :min="0"
                :max="100"
                :step="5"
                class="w-full"
              />
              <URange
                v-model="discountRange[1]"
                :min="0"
                :max="100"
                :step="5"
                class="w-full"
              />
            </div>

            <!-- In Stock Only Toggle -->
            <div>
              <UToggle
                v-model="inStockOnly"
                label="In Stock Only"
                color="primary"
              />
            </div>

            <!-- Clear All Button -->
            <UButton
              color="gray"
              variant="soft"
              block
              @click="clearAllFilters"
              class="mt-4"
            >
              Clear All Filters
            </UButton>
          </div>
        </UCard>
      </UModal>

      <!-- Mobile menu for categories -->
      <UModal v-model="isMobileMenuOpen" :transition="true">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-medium">Categories</h3>
              <UButton
                color="gray"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                @click="isMobileMenuOpen = false"
              />
            </div>
          </template>

          <div class="space-y-2">
            <UButton
              v-for="category in allCategories"
              :key="category.id"
              :label="category.name"
              :color="selectedCategory?.id === category.id ? 'primary' : 'gray'"
              variant="soft"
              block
              @click="filterByCategory(category); isMobileMenuOpen = false"
              class="justify-start"
            />
          </div>
        </UCard>
      </UModal>

      <UDashboardPanelContent>
        <div class="w-full">
          <StoreBanner />
        </div>

        <!-- Active Filter Indicators -->
        <div v-if="search || selectedCategory || inStockOnly || priceRange[0] > 0 || priceRange[1] < 50000 || discountRange[0] > 0 || discountRange[1] < 100" class="flex flex-wrap gap-2 mb-4 px-4">
          <UBadge
            v-if="search"
            color="blue"
            variant="subtle"
            class="cursor-pointer"
            @click="search = ''"
          >
            Search: "{{ search }}"
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
          </UBadge>
          
          <UBadge
            v-if="selectedCategory"
            color="green"
            variant="subtle"
            class="cursor-pointer"
            @click="selectedCategory = null"
          >
            Category: {{ selectedCategory.name }}
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
          </UBadge>
          
          <UBadge
            v-if="inStockOnly"
            color="orange"
            variant="subtle"
            class="cursor-pointer"
            @click="inStockOnly = false"
          >
            In Stock Only
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
          </UBadge>

          <UBadge
            v-if="priceRange[0] > 0 || priceRange[1] < 50000"
            color="purple"
            variant="subtle"
            class="cursor-pointer"
            @click="priceRange = [0, 50000]"
          >
            Price: ₹{{ priceRange[0] }} - ₹{{ priceRange[1] }}
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
          </UBadge>

          <UBadge
            v-if="discountRange[0] > 0 || discountRange[1] < 100"
            color="red"
            variant="subtle"
            class="cursor-pointer"
            @click="discountRange = [0, 100]"
          >
            Discount: {{ discountRange[0] }}% - {{ discountRange[1] }}%
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
          </UBadge>
        </div>

        <!-- Loading state -->
        <div v-if="isLoading && page === 1" class="w-full flex justify-center my-12">
          <UButton
            loading
            color="primary"
            variant="ghost"
            label="Loading store data..."
          />
        </div>
        
        <!-- Error state -->
        <div v-else-if="error" class="w-full text-center py-12">
          <UAlert
            title="Failed to load store data"
            :description="error.message || String(error)"
            color="red"
            variant="solid"
            icon="i-heroicons-exclamation-triangle"
            class="mb-4"
          />
        </div>
        
        <!-- Content -->
        <template v-else>
          <!-- Categories Section -->
          <section v-if="allCategories.length > 0 && !search && !selectedCategory" class="mb-12 px-4">
            <h2 class="text-2xl font-bold mb-6 font-serif">Shop by Category</h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div 
                v-for="category in allCategories"
                :key="category.id"
                class="group relative rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 h-40 cursor-pointer border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                @click="filterByCategory(category)"
              >
                <div class="absolute inset-0 flex items-center justify-center p-4 text-center">
                  <div>
                    <UIcon 
                      name="i-heroicons-tag" 
                      class="w-10 h-10 text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform" 
                    />
                    <h3 class="mt-3 font-bold text-gray-900 dark:text-white">{{ category.name }}</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {{ category.products?.length || 0 }} items
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Trending Products -->
          <section v-if="trendingVariants.length > 0 && !search && !selectedCategory" class="mb-12 px-4">
            <h2 class="text-2xl font-bold mb-6 font-serif">Trending Now</h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <ProductsProductCard
                v-for="(variant, index) in trendingVariants.slice(0, 6)"
                :key="`trending-${variant.id}`"
                :variant="variant"
                :index="index"
                @quick-view="openQuickView"
              />
            </div>
          </section>

          <!-- All Products -->
          <section class="px-4">
            <div class="flex justify-between items-center mb-6">
              <h2 class="text-2xl font-bold font-serif">All Products</h2>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                Showing {{ flatVariants.length }} products
              </span>
            </div>

            <!-- Skeleton loading -->
            <div v-if="isLoading && page === 1" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div v-for="n in 12" :key="n" class="animate-pulse overflow-hidden rounded-lg">
                <div class="relative aspect-square bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 animate-shimmer">
                  <div class="absolute inset-0 bg-gray-300 dark:bg-gray-600 opacity-20 animate-pulse"></div>
                </div>
                <div class="mt-3 space-y-2">
                  <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded-full w-3/4"></div>
                  <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded-full w-1/2"></div>
                </div>
              </div>
            </div>

            <!-- Products grid -->
            <div v-else-if="flatVariants.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <ProductsProductCard
                v-for="(variant, index) in flatVariants"
                :key="variant.id"
                :variant="variant"
                :index="index"
                :class="{
                  'opacity-0 translate-y-5': !isVisible[index],
                  'opacity-100 translate-y-0': isVisible[index],
                  'transition-all duration-300 ease-out': true
                }"
                @quick-view="openQuickView"
                @vue:mounted="handleIntersection(index)"
                :data-index="index"
              />
            </div>
            <div v-else class="w-full text-center py-12 text-gray-500 dark:text-gray-400">
              <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 mx-auto mb-4 animate-bounce" />
              <h3 class="text-xl font-medium">No products found</h3>
              <p class="mt-2">Try adjusting your search or filter criteria</p>
              <UButton
                v-if="search || selectedCategory || inStockOnly || priceRange[0] > 0 || priceRange[1] < 50000 || discountRange[0] > 0 || discountRange[1] < 100"
                color="primary"
                variant="ghost"
                label="Clear filters"
                @click="clearAllFilters"
                class="mt-4 animate-pulse"
              />
            </div>
            
            <!-- Loading more indicator -->
            <div v-if="loadingMore" class="w-full flex justify-center my-8">
              <UButton
                loading
                color="primary"
                variant="ghost"
                label="Loading more products..."
                icon="i-heroicons-arrow-path"
                class="animate-spin"
              />
            </div>
            
            <!-- End of results message -->
            <div v-if="!hasMore && flatVariants.length > 0" class="w-full text-center py-8 text-gray-500 dark:text-gray-400">
              <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-primary-500" />
              <p>You've reached the end of products</p>
            </div>
          </section>
        </template>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- Quick View Modal -->
    <UModal v-model="showQuickView" :transition="true">
      <UCard 
        v-if="quickViewProduct"
        class="relative overflow-hidden"
        :ui="{ 
          base: 'transition-all duration-300 ease-out',
          ring: 'ring-2 ring-primary-500/10',
          shadow: 'shadow-xl'
        }"
      >
        <!-- Add a subtle background pattern -->
        <div class="absolute inset-0 -z-10 opacity-5 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBmaWxsPSJub25lIiBzdHJva2U9IiM4ODgiIG9wYWNpdHk9IjAuMiIgc3Ryb2tlLXdpZHRoPSIxIj48cGF0aCBkPSJNMCAwaDQwdjQwSDB6Ii8+PC9zdmc+')]"></div>
        
        <template #header>
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold font-serif">{{ quickViewProduct.product.name }}</h3>
            <UButton 
              color="gray" 
              variant="ghost" 
              icon="i-heroicons-x-mark-20-solid" 
              @click="showQuickView = false"
            />
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Image with floating animation -->
          <div class="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
            <img
              :src="quickViewProduct.mainImage"
              :alt="quickViewProduct.product.name"
              class="w-full h-full object-cover animate-float"
            />
          </div>

          <!-- Product details -->
          <div>
            <div class="space-y-4">
              <div>
                <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h4>
                <p class="mt-1 text-gray-900 dark:text-gray-100">
                  {{ quickViewProduct.product.description || 'No description available' }}
                </p>
              </div>

              <div>
                <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Price</h4>
                <div v-if="quickViewProduct.dprice && quickViewProduct.dprice < quickViewProduct.sprice" class="flex items-center space-x-2">
                  <span class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                    ₹{{ quickViewProduct.dprice.toFixed(2) }}
                  </span>
                  <span class="text-lg text-gray-500 dark:text-gray-400 line-through">
                    ₹{{ quickViewProduct.sprice.toFixed(2) }}
                  </span>
                  <span class="text-sm font-medium text-red-600 dark:text-red-400">
                    {{ Math.round((1 - quickViewProduct.dprice / quickViewProduct.sprice) * 100) }}% OFF
                  </span>
                </div>
                <span v-else class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ₹{{ quickViewProduct.sprice.toFixed(2) }}
                </span>
              </div>

              <div v-if="quickViewProduct.sizes && quickViewProduct.sizes.length">
                <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">Sizes</h4>
                <div class="flex flex-wrap gap-2 mt-2">
                  <UBadge
                    v-for="(size, index) in parseSizes(quickViewProduct.sizes)"
                    :key="index"
                    :color="size.qty > 0 ? 'primary' : 'gray'"
                    variant="outline"
                    size="lg"
                    class="cursor-pointer"
                    :class="size.qty === 0 ? 'opacity-50 line-through' : ''"
                  >
                    {{ size.size }}
                  </UBadge>
                </div>
              </div>
            </div>

            <div class="mt-6 flex space-x-3">
              <UButton
                icon="i-heroicons-heart"
                color="gray"
                variant="outline"
                :class="{ 'text-red-500': likeStore.isLiked({ variantId: quickViewProduct.id }) }"
                @click="toggleLikeInQuickView(quickViewProduct)"
              >
                {{ likeStore.isLiked({ variantId: quickViewProduct.id }) ? 'Liked' : 'Wishlist' }}
              </UButton>
              <UButton
                icon="i-heroicons-shopping-cart"
                color="primary"
                @click="addToCartFromQuickView(quickViewProduct)"
                class="animate-pulse hover:animate-none"
              >
                Add to Cart
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </UModal>
  </UDashboardPage>
</template>

<style>
/* Font styles */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.font-serif {
  font-family: 'Playfair Display', serif;
}

/* Animations */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
.animate-float {
  animation: float 6s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.animate-shimmer {
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

/* Hide scrollbar but allow scrolling */
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

/* Product card hover effects */
.group:hover .transform {
  transform: translateY(-5px);
}

/* Transition effects */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
}
::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>