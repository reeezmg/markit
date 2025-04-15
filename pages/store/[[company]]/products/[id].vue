<script setup>
import { useFindUniqueProduct } from '~/lib/hooks';
import { ref, computed, watchEffect } from 'vue';


const route = useRoute();
const selectedVariant = ref(route.query.variant || 0);
const cartStore = useCartStore();
const likeStore = useLikeStore();
const toast = useToast()

const selectedSizes = ref(new Set()); 

watchEffect(() => {
    console.log(route.query.variant);
});

const { data: product, isLoading, error, refetch } = useFindUniqueProduct({
    where: {
        id: route.params.id,
    },
    select: {
        id: true,
        name: true,
        description: true,
        company: {
            select: {
                id: true,
                name: true,
            },
        },
        variants: true,
    },
});

// ✅ Handle actions safely, accounting for missing `sizes`
const actions = computed(() => {
    if ( !product.value.variants[selectedVariant.value]?.sizes) return [];

    return product.value.variants[selectedVariant.value]?.sizes?.map((size, index) => ({
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

    if (currentVariant.sizes && currentVariant.sizes.length > 0) {
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
            size: currentVariant.sizes[index].size
        }));

        selectedItems.forEach(item => cartStore.addToCart(item));
        const sizeDescription = selectedItems.map(item => item.size).join(', ');

        toast.add({
            title: 'Added to Cart',
            description: `Size(s): ${sizeDescription} added to cart.`,
            color: 'green',
            icon: 'i-heroicons-check-circle',
        });
        
        selectedSizes.value.clear();
    } else {
        // If no sizes exist, add the variant directly
        cartStore.addToCart({
            variantId: currentVariant.id,
            size: null  // No size
        });
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

    if (currentVariant.sizes && currentVariant.sizes[index]?.qty !== 0) {
        if (selectedSizes.value.has(index)) {
            selectedSizes.value.delete(index); 
        } else {
            selectedSizes.value.add(index);     
        }
    }
};
</script>

<template>
    <UDashboardPanelContent>
        <UContainer>

            <div v-if="isLoading" class="text-center">Loading...</div>

            <div v-else-if="error" class="text-red-500 text-center">
                Failed to load product.
            </div>

            <div v-else class="grid lg:grid-cols-2 gap-8">
                
                <!-- Image Gallery -->
                <UCard class="p-1 min-h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)]">
                    <UCarousel
                        :items="product.variants[selectedVariant]?.images || []"
                        arrows
                        indicators
                        :ui="{
                            item: 'basis-full',
                            container: 'rounded-lg',
                            indicators: { wrapper: 'relative bottom-0 mt-1' }
                        }"
                        :prev-button="{ color: 'primary', icon: 'i-heroicons-arrow-left-20-solid' }"
                        :next-button="{ color: 'primary', icon: 'i-heroicons-arrow-right-20-solid' }"
                        class="w-full h-full"
                    >
                        <template #default="{ item }">
                            <img
                                :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${item}`"
                                class="h-[calc(100vh-12.875rem)] w-full object-contain"
                                draggable="false"
                            />
                        </template>

                        <template #indicator="{ onClick, page, active }">
                            <UAvatar
                                :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${
                                    product.variants[selectedVariant]?.images[page - 1] || ''
                                }`"
                                size="xl"
                                :ui="{ rounded: 'rounded-md' }"
                                class="mx-1 mt-2 cursor-pointer rounded-md border-4"
                                :class="{ 'border-primary': active, 'border-gray-300': !active }"
                                @click="onClick(page)"
                            />
                        </template>
                    </UCarousel>
                </UCard>

                <!-- Product Details -->
                <UCard class="p-1 min-h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] overflow-y-auto">
                    
                    <h1 class="text-xl font-bold">{{ product.name }}</h1>
                    <div class="mt-2">
                        <p class="text-lg font-semibold text-primary-400">
                            ${{ product.variants[selectedVariant]?.pprice || 'N/A' }}
                        </p>
                    </div>

                    <UDivider class="my-4" />

                    <div>
                        <div class="text-xs mb-1">Variants</div>
                        <div class="mb-4 grid grid-cols-3 md:grid-cols-6 lg:grid-cols-6 gap-4">
                            <div
                                v-for="(variant, index) in product.variants"
                                :key="index"
                                class="flex flex-col items-center p-1 rounded-lg transition hover:scale-105 ring-1 dark:ring-gray-800 hover:!ring-primary-400"
                                :class="{ '!ring-primary-400': selectedVariant == index, 'ring-gray-200': !(selectedVariant == index) }"
                                @click="selectedVariant = index"
                            >
                                <UAvatar
                                    :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${variant.images[0]}`"
                                    size="xl"
                                    :ui="{ rounded: 'rounded-md' }"
                                    class="cursor-pointer border-2 border-gray-300 transition"
                                />
                                <div class="mt-2 text-sm">{{ variant.name }}</div>
                                <div class="text-xs">₹{{ variant.pprice }}</div>
                            </div>
                        </div>
                    </div>

                    <div v-if="product.variants[selectedVariant]?.sizes?.length > 0">
                        <div class="text-xs mb-1">Sizes</div>
                        <div class="mb-4 grid grid-cols-3 md:grid-cols-6 lg:grid-cols-6 gap-4">
                            <UButton
                                v-for="(size, index) in product.variants[selectedVariant]?.sizes || []"
                                :key="index"
                                size="md"
                                :color="selectedSizes.has(index) ? 'primary' : 'gray'"
                                :variant="selectedSizes.has(index) ? 'outline' : 'solid'"
                                :label="size.size"
                                :disabled="size.qty === 0"   
                                class="text-center transition-transform transform scale-100 hover:scale-105"
                                :class="{ 'line-through opacity-10 !text-red-500': size.qty === 0 }"   
                                :ui="{ base: 'inline-flex items-center justify-center' }"
                                @click="()=>handleSizeSelect(index)"
                            />
                        </div>
                    </div>

                    <!-- Cart Buttons -->
                    <div class="mt-6 flex flex-row gap-4">
                        <UButton
                            color="primary"
                            icon="i-heroicons-shopping-cart"
                            size="lg"
                            @click="addToCart"
                            block
                            class="flex-1"
                        >
                            Add to Cart
                        </UButton>
                        <UButton
                            :color="isLiked ? 'primary' : 'red'"
                            size="lg"
                            :icon="isLiked ? 'i-heroicons-heart' : 'i-heroicons-heart-solid'"
                            @click="toggleLike"
                            block
                            class="flex-1"
                            >
                            {{ isLiked ? 'Add to Wishlist' : 'Remove from Wishlist' }}
                            </UButton>

                    </div>

                    <UDivider class="my-4" />
                    <div class="mt-4 text-sm">{{ product.description }}</div>

                </UCard>
            </div>
        </UContainer>
    </UDashboardPanelContent>
</template>
