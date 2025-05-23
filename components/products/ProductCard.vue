<script setup lang="ts">
import type { VariantWithProduct } from '~/types/store';
import type { CartItem } from '~/types/cart';

interface ProductCardProps {
  index: number;
  variant: VariantWithProduct;
}

const props = defineProps<ProductCardProps>();
const emit = defineEmits(['quick-view']);

const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const likeStore = useLikeStore();
const toast = useToast();

// Current product data
const product = computed(() => props.variant.product);
const variants = computed(() => product.value.variants);
const currentVariantIndex = ref(variants.value.findIndex(v => v.id === props.variant.id) || 0);
const selectedSize = ref<number | null>(null);
const isHovered = ref(false);

// Product status
const isNewProduct = computed(() => {
  const createdAt = new Date(product.value.createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdAt.getTime()); 
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays <= 14;
});

const isLowStock = computed(() => {
  const qty = props.variant.qty ?? 0; // Provide default value if null
  return qty > 0 && qty <= 5;
});

const isOutOfStock = computed(() => {
  const qty = props.variant.qty ?? 0; // Provide default value if null
  return qty === 0;
});

// Price calculations
const hasDiscount = computed(() => {
  return props.variant.discount != null &&
         props.variant.dprice != null &&
         props.variant.dprice > 0 &&
         props.variant.dprice < props.variant.sprice;
});

const discountPercentage = computed(() => {
  if (props.variant.discount != null) {
    return props.variant.discount;
  }
  if (props.variant.dprice != null && props.variant.sprice) {
    return Math.round((1 - props.variant.dprice / props.variant.sprice) * 100);
  }
  return 0;
});

const currentPrice = computed(() => {
  return hasDiscount.value ? props.variant.dprice! : props.variant.sprice;
});

const formatPrice = (price: number) => {
  return price % 1 === 0 ? `₹${price.toFixed(0)}` : `₹${price.toFixed(2)}`;
};

// Size handling
type VariantSize = { size: string; qty: number };

function parseSizes(sizes: unknown): VariantSize[] {
  if (Array.isArray(sizes)) {
    return sizes.map(size => ({
      size: size.size || size,
      qty: size.qty || (isOutOfStock.value ? 0 : 1) // Default to 1 if in stock, 0 if out of stock
    }));
  }
  return [];
}

const availableSizes = computed(() => {
  return parseSizes(props.variant.sizes).filter(size => size.qty > 0);
});

// Navigation
const cleanFullPath = route.fullPath.replace(/\/$/, '');
const navigateToProduct = () => {
  router.push({
    path: `${cleanFullPath}/products/${product.value.id}`,
    query: { variant: props.variant.id }
  });
};

// Variant carousel
const showNextVariant = () => {
  currentVariantIndex.value = (currentVariantIndex.value + 1) % variants.value.length;
};
const showPrevVariant = () => {
  currentVariantIndex.value = (currentVariantIndex.value - 1 + variants.value.length) % variants.value.length;
};

// Quick view
const triggerQuickView = (e: Event) => {
  e.stopPropagation();
  emit('quick-view', props.variant);
};

// Cart actions
const addToCart = async (e?: Event) => {
  if (e) e.stopPropagation();
  
  if (isOutOfStock.value) {
    toast.add({
      title: 'Out of Stock',
      description: 'This product is currently out of stock',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    });
    return;
  }

  const variant = variants.value[currentVariantIndex.value];
  const sizes = parseSizes(variant.sizes);
  const companyId = variant.companyId;
  const qty = 1;

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
            selectedSize.value = index;
            addToCart();
          },
          class: 'hover:bg-gray-100 dark:hover:bg-gray-800'
        })),
        ui: { actions: 'flex flex-wrap items-center gap-2 mt-3' }
      });
      return;
    }

    const selected = sizes[selectedSize.value];

    await cartStore.addToCart(
      { variantId: variant.id, size: selected.size, qty } as CartItem,
      companyId
    );

    showSuccessToast(`Size: ${selected.size} added to cart.`);
    selectedSize.value = null;
  } else {
    await cartStore.addToCart(
      { variantId: variant.id, size: null, qty } as CartItem,
      companyId
    );
    showSuccessToast(`Added to cart.`);
  }
};

// Like
const toggleLike = (e: Event) => {
  e.stopPropagation();
  const likedItem = { variantId: props.variant.id };
  const isLiked = likeStore.toggleLike(likedItem) ?? false;

  toast.add({
    title: isLiked ? 'Liked' : 'Unliked',
    description: isLiked
      ? `${product.value.name} added to your likes.`
      : `${product.value.name} removed from your likes.`,
    color: isLiked ? 'primary' : 'red',
    icon: isLiked ? 'i-heroicons-heart-solid' : 'i-heroicons-heart',
  });
};

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
  });
};
</script>

<template>
  <li
    class="col-span-1 flex flex-col divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm hover:shadow-md overflow-hidden cursor-pointer transition-all duration-200 group relative"
    @click="navigateToProduct"
    :class="{ 'opacity-70': isOutOfStock }"
  >
    <!-- Out of Stock Overlay -->
    <div 
      v-if="isOutOfStock"
      class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 z-20 flex items-center justify-center"
    >
      <span class="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
        Out of Stock
      </span>
    </div>

    <!-- Image Container (Maintains proper aspect ratio) -->
    <div class="relative w-full aspect-[4/5] overflow-hidden bg-gray-100 dark:bg-gray-800">
      <!-- Badges -->
      <div class="absolute top-2 left-2 z-10 flex flex-col space-y-1">
        <UBadge
          v-if="isNewProduct"
          color="green"
          variant="solid"
          size="xs"
          class="font-bold"
          :ui="{ rounded: 'rounded-full' }"
        >
          New
        </UBadge>
      </div>
      
      <!-- Discount Badge -->
      <UBadge
        v-if="hasDiscount"
        color="red"
        variant="solid"
        size="xs"
        class="absolute top-2 right-2 z-10 font-bold"
        :ui="{ rounded: 'rounded-full' }"
      >
        {{ discountPercentage }}% OFF
      </UBadge>

      <!-- Product Image -->
      <div class="relative w-full h-full">
        <template v-for="(variant, idx) in variants" :key="variant.id">
          <img
            v-if="variant.images?.[0]"
            :src="`https://images.markit.co.in/${variant.images[0]}`"
            :class="['absolute inset-0 w-full h-full object-cover transition-opacity duration-300', currentVariantIndex === idx ? 'opacity-100' : 'opacity-0']"
            :alt="`${product.name} - ${variant.name}`"
            loading="lazy"
          />
        </template>

        <div 
          v-if="!variants.some(v => v.images?.length)"
          class="absolute inset-0 flex items-center justify-center"
        >
          <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400" />
        </div>
      </div>

      <!-- Quick View Button -->
      <div 
        class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/10"
        @click.stop="triggerQuickView"
      >
        <UButton
          icon="i-heroicons-eye"
          color="white"
          variant="solid"
          size="xs"
          label="Quick View"
          class="z-10 scale-90 group-hover:scale-100 transition-transform duration-200"
        />
      </div>
    </div>

    <!-- Product Info (Compact but readable) -->
    <div class="flex flex-col p-2 space-y-1 flex-grow">
      <h3 class="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
        {{ product.name }}
      </h3>
      
      <!-- Price -->
      <div class="mt-1">
        <template v-if="!hasDiscount">
          <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {{ formatPrice(props.variant.sprice) }}
          </span>
        </template>
        <template v-else>
          <div class="flex items-baseline gap-1">
            <span class="text-xs text-gray-500 dark:text-gray-400 line-through">
              {{ formatPrice(props.variant.sprice) }}
            </span>
            <span class="text-sm font-semibold text-primary-600 dark:text-primary-400">
              {{ formatPrice(currentPrice) }}
            </span>
          </div>
        </template>
      </div>
      
      <!-- Size Selection -->
      <div v-if="parseSizes(props.variant.sizes).length > 0" class="mt-1 flex flex-wrap gap-1">
        <UBadge
          v-for="(size, index) in parseSizes(props.variant.sizes)"
          :key="index"
          :color="selectedSize === index ? 'primary' : 'gray'"
          variant="outline"
          size="xs"
          class="cursor-pointer px-1.5 py-0.5 text-xs"
          :class="size.qty === 0 ? 'opacity-50 line-through' : ''"
          @click.stop="selectedSize = index"
        >
          {{ size.size }}
        </UBadge>
      </div>
    </div>

    <!-- Action Buttons (Compact) -->
    <div class="flex divide-x divide-gray-200 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800">
      <button
        class="flex-1 py-2 flex items-center justify-center text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        @click.stop="toggleLike"
      >
        <UIcon
          :name="likeStore.isLiked({ variantId: props.variant.id }) ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
          class="w-4 h-4"
          :class="likeStore.isLiked({ variantId: props.variant.id }) ? 'text-red-500' : 'text-gray-400 group-hover:text-red-500'"
        />
      </button>
      <button
        class="flex-1 py-2 flex items-center justify-center text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        @click.stop="addToCart"
      >
        <UIcon
          name="i-heroicons-shopping-cart"
          class="w-4 h-4 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400"
        />
      </button>
    </div>
  </li>
</template>