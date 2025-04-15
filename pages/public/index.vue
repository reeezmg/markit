<script setup lang="ts">
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import { useFindManyProduct } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';

useHead({
    title: 'Marketplace',
});

definePageMeta({
    auth: false,
    layout: false,
});


const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$authClient;
const auth = useAuth();
const route = useRoute();
const router = useRouter();

const queryParam = route.query;

type Category = { id: string; name: string };

const search = ref('');
const selectedCategory = ref<Category[]>([]);
const categoriesInitialized = ref(false);
const categories = ref<any[]>([]);

const queryArgs = computed<Prisma.ProductFindManyArgs>(() => {
    const filters = [
        { name: { contains: search.value } },
        { status: true },
        ...(queryParam.companyId
            ? [{ companyId: queryParam.companyId }]
            : [{ company: { type: 'seller' } }]),
    ] as Prisma.ProductWhereInput[];

    if (selectedCategory.value.length > 0) {
        filters.push({
            categoryId: {
                in: selectedCategory.value.map((item) => item.value),
            },
        });
    }

    return {
        where: {
            AND: filters,
        },
        select: {
            id: true,
            name:true,
            price:true,
            company: true,
            category: {
                select: {
                        id: true,
                        name: true,
                        },
            },
            images: true,
        },
    };
});

const {
    data: products,
    isLoading,
    error,
    refetch,
} = useFindManyProduct(queryArgs);

// watchEffect(() => {
//     if (products.value && !categoriesInitialized.value) {
//         let indexCounter = 0;
//         const uniqueCategories = new Set();
//         categories.value = products.value.flatMap((product) =>
//             product.categories
//                 .map((category) => ({
//                     key: indexCounter++,
//                     label: category.category.name,
//                     value: category.category.id,
//                 }))
//                 .filter((category) => {
//                     if (!uniqueCategories.has(category.value)) {
//                         uniqueCategories.add(category.value);
//                         return true;
//                     }
//                     return false;
//                 })
//         );
//         categoriesInitialized.value = true;
//     }
// });

const range = ref<Range>({
    start: sub(new Date(), { days: 14 }),
    end: new Date(),
});
const period = ref<Period>('daily');
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Ecomm">
                <template #right>
                    <div class="flex flex-row items-center justify-center">
                    <UButton @click="router.push('/login')"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Login
                    </UButton>
                    <UTooltip class="" text="Notifications" :shortcuts="['N']">
                        <!-- <UButton
                            color="gray"
                            variant="ghost"
                            square
                            @click="isNotificationsSlideoverOpen = true"
                        >
                            <UChip color="red" inset>
                                <UIcon
                                    name="i-heroicons-bell"
                                    class="w-5 h-5"
                                />
                            </UChip>
                        </UButton> -->
                        <NuxtLink
                            :to="`/checkouts`"
                        >
                            <UChip :text="cartItemCount" color="red" size="2xl">
                                <UIcon
                                    name="i-heroicons-shopping-cart"
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
                    <p v-if="queryParam.companyId"
                        >filtered based on companyId:
                        {{ queryParam.companyId }}</p
                    >
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
                    class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
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
</template>
