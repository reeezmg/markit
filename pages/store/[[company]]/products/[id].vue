<script setup>
import { useFindUniqueProduct } from '~/lib/hooks';
import { ref, computed, watchEffect } from 'vue';


const route = useRoute();
const variantId = ref(route.query.variant);
const selectedVariant = ref();
const cartStore = useCartStore();
const likeStore = useLikeStore();
const toast = useToast();
const auth = useClientAuth();

const selectedSizes = ref(new Set()); 



const { data: product, isLoading, error, refetch } = useFindUniqueProduct({
    where: {
        id: route.params.id,
    },
    
    include: {
        company: true,
        variants: {
        include: {
            items: true,
        },
        },
    },
});

watch(product, (newproduct) => {
  if (!variantId.value || !newproduct) return

  const index = product.value.variants.findIndex(v => v.id === variantId.value)
  if (index !== -1) {
    selectedVariant.value = index
    console.log(index)
  }
})


// ✅ Handle actions safely, accounting for missing `sizes`
const actions = computed(() => {
    if ( !product.value.variants[selectedVariant.value]?.items) return [];
    console.log("Company item:",product.value.companyId)
    return product.value.variants[selectedVariant.value]?.items?.map((size, index) => ({
        label: `Size: ${size.size}`,
        click: () => {
            if (size.qty > 0) {
                selectedSizes.value.add(index)
                addToCart()

            }
        },
        disabled: size.qty === 0,   
        class: size.qty === 0 ? 'line-through opacity-50 cursor-not-allowed' : ''
    })) || [];
});




// ✅ Add to Cart Logic with missing `sizes` handling
const addToCart = () => {
    const currentVariant = product.value.variants[selectedVariant.value];

    if (currentVariant.items && currentVariant.items.length > 0) {
        if (selectedSizes.value.size === 0) {
            toast.add({ 
                title: 'Size Missing',
                description: 'Please select at least one size before adding to cart.',
                color: 'red',
                icon: 'i-heroicons-exclamation-triangle',
                actions: actions.value,
                ui: {
                    actions: 'flex flex-wrap items-center gap-2 mt-3'
                }
            });
            return;
        }

        const selectedItems = Array.from(selectedSizes.value).map(index => ({
    variantId: currentVariant.id,
    size: currentVariant.items[index].size,
    qty: 1
}));

       

        selectedItems.forEach(item => cartStore.addToCart(item,product.value?.company?.id,auth.session.value?.id));
        const sizeDescription = selectedItems.map(item => item.size).join(', ');

        toast.add({
            title: 'Added to Cart',
            description: `Size(s): ${sizeDescription} added to cart.`,
            color: 'green',
            icon: 'i-heroicons-check-circle',
        });
        
        selectedSizes.value.clear();
    } else {
        console.log('session Id Id :',auth.session.value?.id)
        
        cartStore.addToCart(
    { variantId: currentVariant.id, size: null ,qty:1},
    product.value?.company?.id,
    auth.session.value?.id
);
        toast.add({
            title: 'Added to Cart',
            description: `Variant: ${currentVariant.name} added to cart.`,
            color: 'green',
            icon: 'i-heroicons-check-circle',
        });
    }
    
};

const isLiked = computed(() => {
    const variantId = product.value?.variants?.[selectedVariant.value]?.id;
    return variantId ? likeStore.isLiked({ variantId }) : false;
});


const toggleLike = () => {
    const variant = product.value?.variants?.[selectedVariant.value];
    if (!variant) return;

    likeStore.toggleLike({ variantId: variant.id });
    
    toast.add({
        title: isLiked.value ? 'Removed from Wishlist' : 'Added to Wishlist',
        icon: isLiked.value ? 'i-heroicons-heart' : 'i-heroicons-heart-solid',
        color: isLiked.value ? 'red' : 'primary',
    });
};


// ✅ Handle Size Selection safely
const handleSizeSelect = (index) => {
    const currentVariant = product.value.variants[selectedVariant.value];

    if (currentVariant.items && currentVariant.items[index]?.qty !== 0) {
        if (selectedSizes.value.has(index)) {
            selectedSizes.value.delete(index); 
        } else {
            selectedSizes.value.add(index);     
        }
    }
};

// Price display logic
const hasDiscount = computed(() => {
    const variant = product.value?.variants?.[selectedVariant.value];
    return variant?.discount > 0 && variant?.dprice > 0 && variant.dprice < variant.sprice;
});

const discountPercentage = computed(() => {
    const variant = product.value?.variants?.[selectedVariant.value];
    return variant?.discount || Math.round((1 - variant?.dprice / variant?.sprice) * 100);
});

const formatPrice = (price) => {
    if (!price) return '₹0';
    return price % 1 === 0 ? `₹${price.toFixed(0)}` : `₹${price.toFixed(2)}`;
};
</script>

<template>
    <UDashboardPanelContent>
        <UContainer class="py-8">
            <div v-if="isLoading" class="text-center py-12">
                <UProgress animation="carousel" />
                <p class="mt-4 text-gray-500">Loading product details...</p>
            </div>

            <div v-else-if="error" class="text-center py-12">
                <UIcon name="i-heroicons-exclamation-triangle" class="text-red-500 text-4xl" />
                <p class="mt-4 text-red-500 text-lg">Failed to load product</p>
                <UButton 
                    color="primary" 
                    variant="outline" 
                    class="mt-4"
                    @click="refetch"
                >
                    Try Again
                </UButton>
            </div>

            <div v-else class="grid lg:grid-cols-2 gap-8">
                <!-- Image Gallery -->
                <UCard class="p-4 h-full" :ui="{ body: { padding: 'p-0 sm:p-0' } }">
                    <div class="relative">
                        <UCarousel
                            :items="product.variants[selectedVariant]?.images || []"
                            arrows
                            indicators
                            :ui="{
                                item: 'basis-full',
                                container: 'rounded-lg',
                                indicators: { wrapper: 'relative bottom-0 mt-4' }
                            }"
                            :prev-button="{ 
                                color: 'white', 
                                icon: 'i-heroicons-arrow-left-20-solid',
                                class: 'ml-2 bg-gray-900/50 hover:bg-gray-900/70'
                            }"
                            :next-button="{ 
                                color: 'white', 
                                icon: 'i-heroicons-arrow-right-20-solid',
                                class: 'mr-2 bg-gray-900/50 hover:bg-gray-900/70'
                            }"
                            class="w-full"
                        >
                            <template #default="{ item }">
                                <img
                                    :src="`https://images.markit.co.in/${item}`"
                                    class="w-full h-[500px] object-contain"
                                    draggable="false"
                                />
                            </template>

                            <template #indicator="{ onClick, page, active }">
                                <UAvatar
                                    :src="`https://images.markit.co.in/${
                                        product.variants[selectedVariant]?.images[page - 1] || ''
                                    }`"
                                    size="xl"
                                    :ui="{ rounded: 'rounded-md' }"
                                    class="mx-1 cursor-pointer transition-all duration-200"
                                    :class="{
                                        'ring-2 ring-primary-500 scale-105': active,
                                        'opacity-70 hover:opacity-100': !active
                                    }"
                                    @click="onClick(page)"
                                />
                            </template>
                        </UCarousel>

                        <!-- Discount Badge -->
                        <UBadge
                            v-if="hasDiscount"
                            color="red"
                            variant="solid"
                            size="lg"
                            class="absolute top-4 right-4 font-bold z-10 shadow-lg"
                            :ui="{
                                rounded: 'rounded-full',
                                padding: { xs: 'px-3 py-1' },
                                font: 'font-bold text-sm'
                            }"
                        >
                            {{ discountPercentage }}% OFF
                        </UBadge>
                    </div>
                </UCard>

                <!-- Product Details -->
                <UCard class="p-4 h-full">
                    <div class="space-y-6">
                        <!-- Product Title & Price -->
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                                {{ product.name }}
                            </h1>
                            <p class="text-sm text-gray-500 mt-1">
                                Sold by {{ product.company?.name || 'Unknown' }}
                            </p>
                            
                            <div class="mt-4 flex items-center gap-3">
                                <template v-if="hasDiscount">
                                    <span class="text-xl font-semibold text-red-600 dark:text-red-400">
                                        {{ formatPrice(product.variants[selectedVariant]?.dprice) }}
                                    </span>
                                    <span class="text-lg text-gray-500 dark:text-gray-400 line-through">
                                        {{ formatPrice(product.variants[selectedVariant]?.sprice) }}
                                    </span>
                                </template>
                                <template v-else>
                                    <span class="text-xl font-semibold text-gray-900 dark:text-white">
                                        {{ formatPrice(product.variants[selectedVariant]?.sprice) }}
                                    </span>
                                </template>
                            </div>
                        </div>

                        <UDivider />

                        <!-- Variants Selection -->
                        <div>
                            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Available Variants
                            </h3>
                            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                <div
                                    v-for="(variant, index) in product.variants"
                                    :key="index"
                                    class="flex flex-col items-center p-2 rounded-lg transition-all duration-200 cursor-pointer"
                                    :class="{
                                        'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20': selectedVariant == index,
                                        'ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-primary-300': selectedVariant != index
                                    }"
                                    @click="selectedVariant = index"
                                >
                                    <UAvatar
                                        :src="`https://images.markit.co.in/${variant.images[0]}`"
                                        size="xl"
                                        :ui="{ rounded: 'rounded-md' }"
                                        class="border-2 border-gray-200 dark:border-gray-700"
                                    />
                                    <div class="mt-2 text-sm font-medium text-center">
                                        {{ variant.name }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Size Selection -->
                        <div v-if="product.variants[selectedVariant]?.items?.length > 0 && product.variants[selectedVariant]?.items[0]?.size">
                            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Select Size
                            </h3>
                            <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                                <UButton
                                    v-for="(size, index) in product.variants[selectedVariant]?.items || []"
                                    :key="index"
                                    size="md"
                                    :color="selectedSizes.has(index) ? 'primary' : 'gray'"
                                    :variant="selectedSizes.has(index) ? 'solid' : 'outline'"
                                    :label="size.size"
                                    :disabled="size.qty === 0"
                                    class="transition-all"
                                    :class="{
                                        'opacity-50 cursor-not-allowed': size.qty === 0,
                                        'hover:scale-105': size.qty > 0
                                    }"
                                    @click="() => handleSizeSelect(index)"
                                />
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex flex-col sm:flex-row gap-3 pt-4">
                            <UButton
                                color="primary"
                                icon="i-heroicons-shopping-cart"
                                size="lg"
                                @click="addToCart"
                                :disabled="product.variants[selectedVariant]?.items?.length > 0 && selectedSizes.size === 0"
                                class="flex-1 py-3"
                                :ui="{ rounded: 'rounded-lg' }"
                            >
                                Add to Cart
                            </UButton>
                            <UButton
                                :color="isLiked ? 'red' : 'gray'"
                                size="lg"
                                :icon="isLiked ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
                                @click="toggleLike"
                                class="flex-1 py-3"
                                :ui="{ rounded: 'rounded-lg' }"
                                variant="outline"
                            >
                                {{ isLiked ? 'Wishlisted' : 'Wishlist' }}
                            </UButton>
                        </div>

                        <!-- Product Description -->
                        <div class="pt-4">
                            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Product Details
                            </h3>
                            <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                {{ product.description || 'No description available.' }}
                            </p>
                        </div>
                    </div>
                </UCard>
            </div>
        </UContainer>
    </UDashboardPanelContent>
</template>