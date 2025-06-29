<script setup lang="ts">
import type { WishlistVariant } from '~/types/store'
import type { CartItem } from '~/types/cart'

const props = defineProps<{
  variant: WishlistVariant
  isLiked?: boolean
}>()

const emit = defineEmits(['remove'])

const removeItem = (e: Event) => {
  e.stopPropagation()
  emit('remove')
}

const cartStore = useCartStore()
const toast = useToast()
const router = useRouter()
const auth = useClientAuth()
const route = useRoute()

// Size handling
const selectedSize = ref<number | null>(null)
const isHovered = ref(false)

// Product status
const isOutOfStock = computed(() => props.variant.isOutOfStock || false)
const isLowStock = computed(() => {
  const qty = props.variant.availableQty || 0
  return qty > 0 && qty <= 5
})

// Price calculations
const hasDiscount = computed(() => props.variant.dprice && props.variant.dprice < props.variant.sprice)
const currentPrice = computed(() => hasDiscount.value ? props.variant.dprice! : props.variant.sprice)
const discountPercentage = computed(() => {
  if (props.variant.discount) return props.variant.discount
  return Math.round((1 - props.variant.dprice! / props.variant.sprice) * 100)
})

// Size handling
type VariantSize = { size: string; qty: number }

const parseSizes = (items: unknown): { size: string; qty: number }[] => {
  if (!Array.isArray(items)) return []

  return items
    .filter(item => typeof item === 'object' && item !== null && 'size' in item)
    .map(item => ({
      size: String((item as any).size || ''),
      qty: Number((item as any).qty ?? 0),
    }))
    .filter(sizeObj => sizeObj.size !== '')
}



const availableSizes = computed(() => {
  return parseSizes(props.variant.items).filter(size => size.qty > 0)
})

// Navigation
const cleanFullPath = route.fullPath.replace(/\/$/, '')
const navigateToProduct = () => {
  router.push(`/store/${props.variant.product.company.name}/products/${props.variant.product.id}`)
}

// Cart actions
const addToCart = async (e?: Event) => {
  if (e) e.stopPropagation()
  
  if (isOutOfStock.value) {
    toast.add({
      title: 'Out of Stock',
      description: 'This product is currently out of stock',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
    return
  }

  const sizes = parseSizes(props.variant.items)
  const companyId = props.variant.product.company.id
  const qty = 1

  if (sizes.length > 0) {
    if (selectedSize.value === null) {
      toast.add({
        title: 'Size Missing',
        description: 'Please select a size before adding to cart.',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle',
        actions: availableSizes.value.map((size, index) => ({
          label: `Size: ${size.size}`,
          click: () => {
            selectedSize.value = index
            addToCart()
          },
          class: 'hover:bg-gray-100 dark:hover:bg-gray-800'
        })),
        ui: { actions: 'flex flex-wrap items-center gap-2 mt-3' }
      })
      return
    }

    const selected = sizes[selectedSize.value]

    await cartStore.addToCart(
      { variantId: props.variant.id, size: selected.size, qty } as CartItem,
      companyId,
      auth.session.value?.id
    )

    showSuccessToast(`Size: ${selected.size} added to cart.`)
    selectedSize.value = null
  } else {
    await cartStore.addToCart(
      { variantId: props.variant.id, size: null, qty } as CartItem,
      companyId,
      auth.session.value?.id
    )
    showSuccessToast(`Added to cart.`)
  }
}

// Toast
const showSuccessToast = (description: string) => {
  toast.add({
    title: 'Added to Cart',
    description,
    color: 'green',
    icon: 'i-heroicons-check-circle',
    timeout: 2000,
    actions: [{
      label: 'View Cart',
      click: () => router.push(`${cleanFullPath}/checkout`)
    }]
  })
}
</script>

<template>
  <div 
    class="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white dark:bg-gray-800 h-full flex flex-col"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Product Image -->
    <div @click="navigateToProduct" class="aspect-square bg-gray-100 dark:bg-gray-700 cursor-pointer relative overflow-hidden">
      <img 
        v-if="variant.mainImage" 
        :src="variant.mainImage" 
        :alt="variant.product.name"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
        <UIcon name="i-heroicons-photo" class="w-12 h-12" />
      </div>
      
      <!-- Badges -->
      <div class="absolute top-2 left-2 flex flex-col items-start gap-1">
        <span 
          v-if="hasDiscount"
          class="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded"
        >
          {{ discountPercentage }}% OFF
        </span>
        <span 
          v-if="isLowStock"
          class="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded"
        >
          Low Stock
        </span>
      </div>
      
      <!-- Out of Stock -->
      <div 
        v-if="isOutOfStock"
        class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      >
        <span class="text-white font-bold text-sm bg-red-500 px-2 py-1 rounded">
          Out of Stock
        </span>
      </div>
    </div>

    <!-- Product Info -->
    <div class="p-4 flex-grow flex flex-col">
      <h3 @click="navigateToProduct" class="font-medium cursor-pointer hover:text-primary line-clamp-2 mb-2">
        {{ variant.product.name }}
      </h3>
      
      <div class="mt-auto">
        <!-- Price -->
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-2">
            <span class="font-bold text-primary">
              ₹{{ currentPrice.toFixed(2) }}
            </span>
            <span v-if="hasDiscount" class="text-sm text-gray-500 dark:text-gray-400 line-through">
              ₹{{ variant.sprice.toFixed(2) }}
            </span>
          </div>
        </div>

        <!-- Size Selection -->
        <div v-if="availableSizes.length > 0" class="mb-3">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Select Size</div>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="(size, index) in availableSizes"
              :key="size.size"
              :label="size.size"
              :variant="selectedSize === index ? 'solid' : 'outline'"
              size="xs"
              :ui="{ rounded: 'rounded-full' }"
              @click.stop="selectedSize = index"
            />
          </div>
        </div>

        <!-- Add to Cart -->
        <UButton
          block
          :label="isOutOfStock ? 'Out of Stock' : 'Add to Cart'"
          :disabled="isOutOfStock"
          @click.stop="addToCart"
          class="mt-2"
          :ui="{ 
            disabled: 'cursor-not-allowed',
            base: isOutOfStock ? 'bg-gray-300 dark:bg-gray-600' : ''
          }"
        />
      </div>
    </div>

    <!-- Remove button (only shown when isLiked) -->
    <UButton
      v-if="isLiked"
      icon="i-heroicons-trash"
      color="red"
      variant="solid"
      size="xs"
      :ui="{ rounded: 'rounded-full' }"
      class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow"
      @click.stop="removeItem"
    />
  </div>
</template>