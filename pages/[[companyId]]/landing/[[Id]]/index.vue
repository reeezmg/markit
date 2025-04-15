<script setup lang="ts">
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import { useFindManyProduct } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';

useHead({
    title: 'Marketplace',
});


 
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
const route = useRoute();
const router = useRouter();

const queryParam = route.params;

type Category = { id: string; name: string };

const search = ref('');
const selectedCategory = ref<Category[]>([]);
const categoriesInitialized = ref(false);
const categories = ref<any[]>([]);

const queryArgs = computed<Prisma.ProductFindManyArgs>(() => {
    const filters = [
        { name: { contains: search.value } },
        { status: true },
        { companyId: queryParam.Id }
    ] as Prisma.ProductWhereInput[];

    if (selectedCategory.value.length > 0) {
        filters.push({
            categories: {
                some: {
                    categoryId: {
                        in: selectedCategory.value.map((item) => item.value),
                    },
                },
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
            categories: {
                select: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
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

watchEffect(() => {
    if (products.value && !categoriesInitialized.value) {
        let indexCounter = 0;
        const uniqueCategories = new Set();
        categories.value = products.value.flatMap((product) =>
            product.categories
                .map((category) => ({
                    key: indexCounter++,
                    label: category.category.name,
                    value: category.category.id,
                }))
                .filter((category) => {
                    if (!uniqueCategories.has(category.value)) {
                        uniqueCategories.add(category.value);
                        return true;
                    }
                    return false;
                })
        );
        categoriesInitialized.value = true;
    }
});

const range = ref<Range>({
    start: sub(new Date(), { days: 14 }),
    end: new Date(),
});
const period = ref<Period>('daily');
</script>

<template>
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
                <template #right>
                    <USelectMenu
                        v-model="selectedCategory"
                        :options="categories"
                        multiple
                        placeholder="category"
                        class="w-40"
                    />
                </template>
            </UDashboardToolbar>
            <UDashboardPanelContent>
                <div
                    class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                    v-if="products"
                >
                    <ProductsProductCard
                        v-for="(item, index) in products"
                        :key="index"
                        :info="item"
                        :index="index"
                    />
                </div>
            </UDashboardPanelContent>
</template>