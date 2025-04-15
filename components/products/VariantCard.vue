<script setup lang="ts">
import { ref, computed } from 'vue';


const props = defineProps<{
  index: number;
  info: any; // Variant with product info
}>();

const router = useRouter();
const route = useRoute();
const cartStore = useCartStore();
const likeStore = useLikeStore();
const toast = useToast();

const selectedSize = ref<number | null>(null);

const actions = computed(() => {
  if (!props.info.sizes) return [];

  return props.info.sizes.map((size, index) => ({
    label: `Size: ${size.size}`,
    click: () => {
      if (size.qty > 0) {
        selectedSize.value = index;
        addToCart();
      }
    },
    disabled: size.qty === 0,
    class: size.qty === 0 ? 'line-through opacity-50 cursor-not-allowed' : ''
  }));
});

const navigateToProduct = () => {
  router.push({
    path: `./products/${props.info.product.id}`,
    query: { variant: props.info.id }
  });
};

const addToCart = () => {
  if (props.info.sizes && props.info.sizes.length > 0) {
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
      variantId: props.info.id,
      size: props.info.sizes[selectedSize.value].size
    };

    cartStore.addToCart(selectedItem);

    toast.add({
      title: 'Added to Cart',
      description: `Size: ${selectedItem.size} added to cart.`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    });

    selectedSize.value = null;
  } else {
    cartStore.addToCart({
      variantId: props.info.id,
      size: null
    });

    toast.add({
      title: 'Added to Cart',
      description: `Variant: ${props.info.name} added to cart.`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    });
  }
};

const addToLike = () => {
  const likedItem = {
    variantId: props.info.id
  };

  likeStore.toggleLike(likedItem);

  toast.add({
    title: likeStore.isLiked(likedItem) ? 'Liked' : 'Unliked',
    description: likeStore.isLiked(likedItem)
      ? `${props.info.product.name} added to your likes.`
      : `${props.info.product.name} removed from your likes.`,
    color: likeStore.isLiked(likedItem) ? 'primary' : 'red',
    icon: likeStore.isLiked(likedItem)
      ? 'i-heroicons-heart-solid'
      : 'i-heroicons-heart'
  });
};
</script>


<template>
    <li
      class="col-span-1 flex flex-col divide-y-2 divide-gray-200 dark:divide-gray-800 border-2 border-gray-200 dark:border-gray-800 rounded-lg shadow overflow-hidden cursor-pointer"
      @click="navigateToProduct"
    >
      <!-- Image -->
      <div class="relative w-full aspect-w-16 aspect-h-15">
        <img
          :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${info.images[0]}`"
          class="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 opacity-100"
          alt="Product Image"
        />
      </div>
  
      <!-- Product Info -->
      <div class="flex flex-1 flex-col p-3">
        <h3 class="text-sm">
          {{ info.product.name }}
        </h3>
        <h3 class="text-md font-medium">
          $ {{ info.pprice }}
        </h3>
      </div>
  
      <!-- Action Buttons -->
      <div>
        <div class="-mt-px flex divide-x-2 divide-gray-200 dark:divide-gray-800">
          <div class="-ml-px flex w-0 flex-1">
            <div
              class="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-2 text-sm font-semibold text-gray-900"
              @click.stop="addToLike"
            >
              <Icon
                :name="likeStore.isLiked({ variantId: info.id }) 
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
  