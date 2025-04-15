<script setup lang="ts">
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import { useFindManyCompany, useFindManyProduct, useFindUniqueCompany } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';

useHead({
    title: 'Marketplace',
});
definePageMeta({
    layout: false,
});

const isOpen = ref(false)
const isOpenlogin = ref(false)
 
const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$authClient;
const auth = useAuth();
const route = useRoute();
const router = useRouter();

const queryParam = route.params ? route.params : '' as string;

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

const {
    data: company
} = useFindUniqueCompany({where:{id:queryParam.Id}});



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

async function onSubmit() {
    try {
        const res = await authClientRegister(
            formData.email,
            formData.name,
            formData.password,
            formData.phone,
            queryParam.Id
        );
        isOpen = false
        console.log(res)
    } catch (error) {
        console.log(error);
    }
}

async function onSubmitlogin() {
    try {
        const res = await authClientRegister(
            formData.email,
            formData.name,
            formData.companyname,
            formData.password,
        );
        isOpenlogin = false
    } catch (error) {
        console.log(error);
    }
}

const fields = [
    {
        name: 'email',
        type: 'text',
        label: 'Email',
        placeholder: 'Enter your email',
    },
    {
        name: 'name',
        label: 'Your name',
        type: 'text',
        placeholder: 'Enter your name',
    },
    {
        name: 'phone',
        label: 'Your phone number',
        type: 'text',
        placeholder: 'Enter your phone number',
    },
    {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
    },
    {
        name: 'confirmPassword',
        label: 'Confirm password',
        type: 'password',
        placeholder: 'Enter your password',
    },
];

const loginfields = [
    {
        name: 'email',
        type: 'text',
        label: 'Email',
        placeholder: 'Enter your email',
    },
    {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
    },

];

const formData = reactive({
    email: '',
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
});


const loginformData = reactive({
    email: '',
    password: '',
});

</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar :title="company?.name">
                <!-- <UAvatar
                            :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${company?.images}`"
                            :alt="company?.name"
                            size="lg"
                        /> -->
                <template #right>
                    <div class="flex flex-row items-center justify-center">
                <div class="flex flex-row" v-if="!useAuth().session?.value?.id">
                    <UButton  @click="isOpen = true"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Register
                    </UButton>
                    <UButton  @click="isOpenlogin = true"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Login
                    </UButton>
                </div>
                <div class="flex flex-row" v-else>
                    <UButton  @click="authClientLogout()"
                        class="px-5 me-3 flex items-center justify-center rounded-md border border-transparenttext-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2">
                        Logout
                    </UButton>
                </div>
                    <UTooltip class="" text="Notifications" :shortcuts="['N']" v-if="useAuth().session?.value?.id">
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
                    <UTooltip class="" text="Notifications" :shortcuts="['N']" v-else @click="isOpen=true">
                            <UChip :text="cartItemCount" color="red" size="2xl">
                                <UIcon
                                    name="i-heroicons-shopping-cart"
                                    class="w-5 h-5"
                                />
                            </UChip>
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
        </UDashboardPanel>


        <template>
            <div>
                <UModal v-model="isOpenlogin">
                <div class="p-6">
                <div v-for="field in loginfields" :key="field.name" class="mb-3">
                <UFormGroup :name="field.name" :label="field.label">
                    <UInput
                        v-model="formData[field.name]"
                        :type="field.type"
                        :placeholder="field.placeholder"
                    />
                </UFormGroup>
                </div>

            <UButton type="submit" block class="mb-2" @click="onSubmitlogin">
                Continue
            </UButton>
            <div class="text-center w-100 mb-2">
                Or
            </div>
            <UButton type="submit" block class="mb-3" @click="isOpen = true">
                Register
            </UButton>

                </div>
                </UModal>
            </div>
            </template>



            <template>
            <div>
                <UModal v-model="isOpen">
                <div class="p-6">
                <div v-for="field in fields" :key="field.name" class="mb-3">
                <UFormGroup :name="field.name" :label="field.label">
                    <UInput
                        v-model="formData[field.name]"
                        :type="field.type"
                        :placeholder="field.placeholder"
                    />
                </UFormGroup>
                </div>

                <UButton type="submit" block class="mb-3" @click="onSubmit">
                Continue
                </UButton>
                <div>
                    Or
                </div>
                <UButton type="submit" block class="mb-3" @click="isOpenlogin = true">
                    Login
                </UButton>

                </div>
                </UModal>
            </div>
            </template>



    </UDashboardPage>
</template>