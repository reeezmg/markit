<script setup lang="ts">
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import { useFindManyCompany } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import { getShopName, getToken } from '~/services/tiktokService';

useHead({
    title: 'Marketplace',
});





const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const queryParam = route.query;


const search = ref('');
const categories = ref<any[]>([]);
const code = Array.isArray(route.query.code) ? route.query.code[0] : route.query.code;

onBeforeMount(() => {
    if (!useAuth().loggedIn.value) {
        definePageMeta({
            layout: false,
        });
    }else{
        definePageMeta({
            layout: "default",
        });
    }
});


onMounted(async () => {
    if (code && useAuth().loggedIn.value) {
    const res = await getToken(code, useAuth().session.value?.companyId);
}

const resp = await getShopName()
console.log(resp)
});


const queryArgs = computed<Prisma.CompanyFindManyArgs>(() => {
    const filters = [
        { 
            name: { contains: search.value },
            type: "seller"
        },
        { status: true },
    ] as Prisma.CompanyWhereInput[];

    return {
        where: {
            AND: filters,
        },
        select: {
            id: true,
            name: true,
            logo: true,
            users: {
                select: {
                    userId: true, // Selecting user IDs
                },
            },
        },
    };
});


const {
    data: companies,
    isLoading,
    error,
    refetch,
} = useFindManyCompany(queryArgs);


console.log(companies)


</script>
<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title=' Market Place'>
                <template #right>
                    <UButton v-if="!useAuth().loggedIn.value" @click="router.push('/login')"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparent text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Login
                    </UButton>
                    <div v-if="useAuth().loggedIn.value" class="flex flex-row items-center justify-center">
                       
                    <UTooltip class="" text="Notifications" :shortcuts="['N']">
                        <!-- <UButton
                            color="gray"
                            variant="ghost"
                            square
                            @click="isNotificationsSlideoverOpen = true"
                          
                        >
                            <UChip color="red" text="0" size="2xl">
                                <UIcon
                                    name="i-heroicons-bell"
                                    class="w-5 h-5"
                                />
                            </UChip>
                        </UButton> -->
                        <NuxtLink
                            :to="`/checkout`"
                        >
                            <UChip :text="cartItemCount"   class="mt-2 ms-4" color="red" size="2xl">
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
                    <CompanyCard
                        v-for="(item, index) in companies"
                        :key="index"
                        :info="item"
                        :index="index"
                    />
                </div>
            </UDashboardPanelContent>
        </UDashboardPanel>
    </UDashboardPage>
</template>
