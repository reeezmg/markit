<script setup>
import { useFindUniqueProduct } from '~/lib/hooks';
import {
    Disclosure,
    DisclosureButton,
    DisclosurePanel,
    RadioGroup,
    RadioGroupLabel,
    RadioGroupOption,
    Tab,
    TabGroup,
    TabList,
    TabPanel,
    TabPanels,
} from '@headlessui/vue';

definePageMeta({
    auth: false,
    layout: false,
});

const route = useRoute();
const cartStore = useCartStore();
const isAdded = ref(cartStore.items.includes(route.params.id));
const {
    data: product,
    isLoading,
    error,
    refetch,
} = useFindUniqueProduct({
    where: {
        id: route.params.id,
    },
    select: {
        id: true,
        name: true,
        price: true,
        description: true,
        company: {
            select: {
                id: true,
                name: true,
            },
        },
        images: true,
    },
});

const addToCart = () => {
    cartStore.addToCart(route.params.id);
    isAdded.value = true;
};

const removeFromCart = () => {
    cartStore.removeFromCart(route.params.id);
    isAdded.value = false;
};
</script>

<template>
    <UDashboardPanelContent>
        <div class="bg-white">
            <div
                class="mx-auto max-w-2xl px-4 sm:px-6 sm:py-10 lg:max-w-7xl lg:px-8"
            >
                <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
                    <!-- Image gallery -->
                    <TabGroup
                        v-if="product"
                        as="div"
                        class="flex flex-col-reverse"
                    >
                        <!-- Image selector -->
                        <div
                            class="mx-auto mt-6 hidden w-full max-w-2xl sm:block lg:max-w-none"
                        >
                            <TabList class="grid grid-cols-4 gap-6">
                                <Tab
                                    v-for="(image, index) in product.images"
                                    :key="index"
                                    class="relative flex h-24 cursor-pointer items-center justify-center rounded-md bg-white text-sm font-medium uppercase text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring focus:ring-opacity-50 focus:ring-offset-4"
                                    v-slot="{ selected }"
                                >
                                    <span
                                        class="absolute inset-0 overflow-hidden rounded-md"
                                    >
                                        <img
                                            :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${image}`"
                                            alt=""
                                            class="h-full w-full object-cover object-center"
                                        />
                                    </span>
                                    <span
                                        :class="[
                                            selected
                                                ? 'ring-indigo-500'
                                                : 'ring-transparent',
                                            'pointer-events-none absolute inset-0 rounded-md ring-2 ring-offset-2',
                                        ]"
                                        aria-hidden="true"
                                    />
                                </Tab>
                            </TabList>
                        </div>

                        <TabPanels class="aspect-h-1 aspect-w-1 w-full">
                            <TabPanel
                                v-for="(image, index) in product.images"
                                :key="index"
                            >
                                <img
                                    :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${image}`"
                                    :alt="image.alt"
                                    class="h-full w-full object-cover object-center sm:rounded-lg"
                                />
                            </TabPanel>
                        </TabPanels>
                    </TabGroup>

                    <!-- Product info -->
                    <div
                        v-if="product"
                        class="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0"
                    >
                        <h1
                            class="text-3xl font-bold tracking-tight text-gray-900"
                            >{{ product.name }}</h1
                        >
                        <a
                            :href="`/?companyId=${product.company.id}`"
                            class="tracking-tight text-gray-700"
                            >{{ product.company.name }}
                        </a>

                        <div class="mt-3">
                            <h2 class="sr-only">Product information</h2>
                            <p class="text-3xl tracking-tight text-gray-900"
                                >$ {{ product.price }}</p
                            >
                        </div>

                        <div class="mt-6">
                            <h3 class="sr-only">Description</h3>
                            <div class="space-y-6 text-base text-gray-700">
                                {{ product.description }}
                            </div>
                        </div>

                        <form class="mt-6">
                            <!-- Colors -->

                            <div class="mt-10 flex">
                                <UButton
                                    v-if="!isAdded"
                                    class="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-50 sm:w-full"
                                    @click="addToCart"
                                >
                                    Add to cart
                                </UButton>
                                <UButton
                                    v-if="isAdded"
                                    class="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-50 sm:w-full"
                                    @click="removeFromCart"
                                >
                                    Added to cart
                                </UButton>

                                <button
                                    type="button"
                                    class="ml-4 flex items-center justify-center rounded-md px-3 py-3 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                                >
                                    <!-- <HeartIcon class="h-6 w-6 flex-shrink-0" aria-hidden="true" /> -->
                                    <span class="sr-only"
                                        >Add to favorites</span
                                    >
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </UDashboardPanelContent>
</template>
