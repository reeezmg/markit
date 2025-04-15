<script setup lang="ts">
import { ref } from 'vue';


const props = defineProps<{
    index: number;
    info: any;
}>();

const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const likeStore = useLikeStore();


const isAdded = ref(cartStore.items.includes(props.info.id));
const selectedVariant = ref(0);
const selectedSize = ref<number | null>(null); 
const toast = useToast()

const actions = computed(() => {
    if ( !props.info.variants[selectedVariant.value]?.sizes) return [];

    return props.info.variants[selectedVariant.value]?.sizes?.map((size, index) => ({
        label: `Size: ${size.size}`,
        click: () => {
            if (size.qty > 0) {
                selectedSize.value = index
                addToCart()
            }
        },
        disabled: size.qty === 0,   
        class: size.qty === 0 ? 'line-through opacity-50 cursor-not-allowed' : ''
    })) || [];
});

const nextImage = () => {
    selectedVariant.value = (selectedVariant.value + 1) % props.info.variants.length;
};

const prevImage = () => {
    selectedVariant.value = (selectedVariant.value - 1 + props.info.variants.length) % props.info.variants.length;
};

const navigateToProduct = () => {
    router.push({
        path: `${route.fullPath}/products/${props.info.id}`,
        query: { variant: selectedVariant.value }
    });
};

const addToCart = () => {
    const currentVariant = props.info.variants[selectedVariant.value];

    if (currentVariant.sizes && currentVariant.sizes.length > 0) {
        // 🛑 Ensure a size is selected
        if (selectedSize.value === null) {
            toast.add({
                title: 'Size Missing',
                description: 'Please select a size before adding to cart.',
                color: 'red',
                icon: 'i-heroicons-exclamation-triangle',
                actions: actions.value,
                ui: {
                    actions: 'flex flex-wrap items-center gap-2 mt-3'
                }
            });
            return;
        }

        const selectedItem = {
            variantId: currentVariant.id,
            size: currentVariant.sizes[selectedSize.value].size
        };

        cartStore.addToCart(selectedItem);

        toast.add({
            title: 'Added to Cart',
            description: `Size: ${selectedItem.size} added to cart.`,
            color: 'green',
            icon: 'i-heroicons-check-circle',
        });

        selectedSize.value = null;  // ✅ Clear selected size after adding to cart

    } else {
        // ✅ If no sizes exist, add the variant directly
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

const addToLike = () => {
    const currentVariant = props.info.variants[selectedVariant.value];
    const likedItem = {
        variantId: currentVariant.id,
    };

    likeStore.toggleLike(likedItem);

    toast.add({
        title: likeStore.isLiked(likedItem) ? 'Liked' : 'Unliked',
        description: likeStore.isLiked(likedItem)
            ? `${props.info.name} added to your likes.`
            : `${props.info.name} removed from your likes.`,
        color: likeStore.isLiked(likedItem) ? 'primary' : 'red',
        icon: likeStore.isLiked(likedItem)
            ? 'i-heroicons-heart-solid'
            : 'i-heroicons-heart',
    });
};


</script>

<template>
   <li
    class="col-span-1 flex flex-col divide-y-2 divide-gray-200 dark:divide-gray-800 border-2  border-gray-200 dark:border-gray-800 rounded-lg  shadow overflow-hidden cursor-pointer"
    @click="navigateToProduct"
>
        <!-- Image Carousel -->
        <div class="relative w-full aspect-w-16 aspect-h-15">
            <img
                v-for="(variant, idx) in info.variants"
                :key="idx"
                :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${variant.images[0]}`"
                :class="['absolute inset-0 w-full h-full object-cover transition-opacity duration-500', selectedVariant === idx ? 'opacity-100' : 'opacity-0']"
                alt="Product Image"
            />

            <!-- Navigation Buttons -->
            <div class="absolute inset-0 flex justify-between items-center">
                <UButton
                    icon="i-heroicons-arrow-left"
                    size="sm"
                    color="primary"
                    :ui="{ rounded: 'rounded-lg' }"
                    square
                    variant="outline"
                    @click.stop="prevImage"
                />

                <UButton
                    icon="i-heroicons-arrow-right"
                    size="sm"
                    color="primary"
                    :ui="{ rounded: 'rounded-lg' }"
                    square
                    variant="outline"
                    @click.stop="nextImage"
                />
            </div>
        </div>

        <!-- Product Info -->
        <div class="flex flex-1 flex-col p-3">
            <h3 class="text-sm">
                {{ info?.name }}
            </h3>
            <h3 class="text-md font-medium">
                $ {{ info?.variants[selectedVariant].pprice }}
            </h3>
        </div>

        <div>
            <div class="-mt-px flex divide-x-2 divide-gray-200 dark:divide-gray-800">
                <div class="-ml-px flex w-0 flex-1">
                    <div
                        class="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-2 text-sm font-semibold text-gray-900"
                        @click.stop="addToLike"
                    >
                    <Icon
                        :name="likeStore.isLiked({ variantId: info.variants[selectedVariant].id }) 
                                ? 'heroicons:heart-solid' 
                                : 'heroicons:heart'"
                        class="h-5 w-5 text-primary transition duration-300"
                        aria-hidden="true"
                        />
                    </div>

                    
                </div>
                <div class="-ml-px flex w-0 flex-1">
                    <div
                        class="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-2 text-sm font-semibold text-gray-900"
                        @click.stop="addToCart"
                    >
                        <Icon
                            name="heroicons:plus"
                            class="h-5 w-5 text-gray-400 text-primary"
                            aria-hidden="true"
                        />
                    </div>

                    
                </div>
            </div>
        </div>
    </li>
</template>
