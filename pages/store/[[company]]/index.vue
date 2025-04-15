<script setup lang="ts">
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import { useFindManyProduct } from '~/lib/hooks';
useHead({
    title: 'Home Page',
});
definePageMeta({
    auth: false,
    layout: 'store',
});
const useClientAuth = () => useNuxtApp().$authClient;
const route = useRoute();
const router = useRoute();
const cartStore = useCartStore();
const likeStore = useLikeStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const likeItemCount = computed(() => likeStore.likedCount);
const isOpen = ref(false);
const search = ref('');
const selectedCategory = ref<any>([]);
const categoriesInitialized = ref(false);
const categories = ref<any[]>([]);

const queryArgs = computed(() => {
    const filters = [
        { name: { contains: search.value } },
        { status: true },
        { company: { name: route.params.company } },
    ];

    // if (selectedCategory.value.length > 0) {
    //     filters.push({
    //         categoryId: { in: selectedCategory.value.map((item) => item.value),},
    //     });
    // }

    return {
        where: {
            AND: filters,
        },
        include: {
            company: true,
            variants:true
        },
    };
});

const {
    data: products,
    isLoading,
    error,
    refetch,
} = useFindManyProduct(queryArgs);


const { isNotificationsSlideoverOpen } = useDashboard();

const items = [
    [
        {
            label: 'New mail',
            icon: 'i-heroicons-paper-airplane',
            to: '/inbox',
        },
        {
            label: 'New user',
            icon: 'i-heroicons-user-plus',
            to: '/users',
        },
    ],
];

const range = ref<Range>({
    start: sub(new Date(), { days: 14 }),
    end: new Date(),
});
const period = ref<Period>('daily');
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Store">
                <template #right>
                     <div class="flex flex-row items-end justify-end">
                        <UButton v-if="useClientAuth().session.value?.type === 'USER' || !useClientAuth().session.value?.id" @click="isOpen = true"
                            class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                            Login
                        </UButton>
                        <UTooltip class="me-3 " text="Cart" :shortcuts="['C']">
                            <NuxtLink
                                :to="`${route.fullPath}/checkout`"
                            >
                                <UChip :text="cartItemCount" color="red" size="2xl">
                                    <UIcon
                                        name="i-heroicons-shopping-cart"
                                        class="w-5 h-5"
                                    />
                                </UChip>
                            </NuxtLink>
                        </UTooltip>
                        <UTooltip class="me-3" text="Wishlist" :shortcuts="['W']">
                            <NuxtLink
                                :to="`${route.fullPath}/wishlist`"
                            >
                                <UChip :text="likeItemCount" color="red" size="2xl">
                                    <UIcon
                                        name="i-heroicons-heart"
                                        class="w-5 h-5"
                                    />
                                </UChip>
                            </NuxtLink>
                        </UTooltip>
                    </div>
                    
                </template>
            </UDashboardNavbar>

            <UDashboardToolbar>
                <template #left>
                    <UInput
                        v-model="search"
                        icon="i-heroicons-magnifying-glass-20-solid"
                        placeholder="Search..."
                    />
                </template>
                <!-- <template #right>
                    <USelectMenu
                        v-model="selectedCategory"
                        :options="categories"
                        multiple
                        placeholder="category"
                        class="w-40"
                    />
                </template> -->
            </UDashboardToolbar>
            <UDashboardPanelContent>
                <div
                    class="grid grid-cols-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
                >
                    <ProductsProductCard
                        v-for="(item, index) in products"
                        :key="index"
                        :info="item"
                        :index="index"
                    />
                </div>
            </UDashboardPanelContent>
        </UDashboardPanel>
    </UDashboardPage>
    <UModal v-model="isOpen">
    <UCard>
    <template #header>
        <div class="font-semibold text-center">Login</div>
    </template>
    <div class="p-4">
      <CheckoutLogin @close="isOpen = false"/>
    </div>
    </UCard>
    </UModal>
</template>
