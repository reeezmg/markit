<script setup lang="ts">
import { z } from 'zod';
import type { FormError } from '#ui/types';
import { useFindUniqueCompany } from '~/lib/hooks';
import {
    useCreateOrder,
    useCreateProduct,
    useUpdateAddress,
    useFindUniqueAddress,
} from '~/lib/hooks';
definePageMeta({
    auth: true,
});

const CreateOrder = useCreateOrder();
const UpdateAddress = useUpdateAddress();
const CreateProduct = useCreateProduct();
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const router = useRouter();

const cartStore = useCartStore();
const cartCompanyId = computed(() => cartStore.cartCompanyId);


const payToggle = ref("offline")

const links = [
    [
        {
            label: 'Diercet',
            icon: 'i-heroicons-user-circle',
            click: () => (payToggle.value = "offline"),
        },
        {
            label: 'Online',
            icon: 'i-heroicons-banknotes',
            click: () => (payToggle.value = "online"),
        },
        {
            label: 'Book',
            icon: 'i-heroicons-bookmark',
            click: () => (payToggle.value = "online"),
        },
    ],
];

let formData = reactive({
    street: '',
    townCity: '',
    county: '',
    postcode: '',
    country: '',
});
const total = ref(0);
const productId = ref([]);

console.log(cartCompanyId)
const {
    data: offlineInfo,
} = useFindUniqueCompany({
  where:{
    id: cartCompanyId.value 
  },
  select:{
    id: true,
    accHolderName: true,
    sortCode: true,
    accountNo: true,
    bankName: true,
    
  }
});

const contactValue = (data: any) => {
    formData.street = data.formData.street;
    formData.townCity = data.formData.townCity;
    formData.county = data.formData.county;
    formData.postcode = data.formData.postcode;
    formData.country = data.formData.street;
};

const priceValue = (data: any) => {
    total.value = data.total;
    productId.value = data.productId;
};

const {
    data: address,
    isLoading,
    error,
    refetch,
} = useFindUniqueAddress({ where: { userId: useAuth().session.value?.id } });

const handleSubmit = async (e: Event) => {
    e.preventDefault();
    try {
        const res = await UpdateAddress.mutateAsync({
            where: { userId: useAuth().session.value?.id },
            data: {
                street: formData.street,
                townCity: formData.townCity,
                postcode: formData.postcode,
                county: formData.county,
                country: formData.country,
            },
        });
        const orderRes = await CreateOrder.mutateAsync({
            data: {
                total: total.value.toString(),
                paymentStatus: 'PENDING',
                company: {
                    connect: {
                        id: useAuth().session.value?.companyId,
                    },
                },
                fcompany: {
                    connect: {
                        id: cartCompanyId.value,
                    },
                },
                address: {
                    connect: {
                        id: res?.id,
                    },
                },
                products: {
                    create: productId.value.map((id) => ({
                        product: { connect: { id } },
                    })),
                },
            },
            include: {
                products: {
                    include: {
                        product: {
                            include: {
                                categories: {
                                    include: {
                                        category: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (orderRes?.products && Array.isArray(orderRes.products)) {
            // Create products after the order is confirmed
            for (const item of orderRes.products) {
                await CreateProduct.mutateAsync({
                    data: {
                        name: item.product.name || '',
                        price: item.product.price || 0,
                        description: item.product.description || '',
                        status: true,
                        images: item.product.images,
                        company: {
                            connect: {
                                id: useAuth().session.value?.companyId,
                            },
                        },
                        categories: {
                            create: item.product.categories.map(
                                (categoryItem) => ({
                                    category: {
                                        connect: {
                                            id: categoryItem.category.id,
                                        },
                                    },
                                }),
                            ),
                        },
                    },
                });
            }
        }
        toast.add({
            title: 'Order Confirmed !',
            id: 'modal-success',
        });
        cartStore.clear();
        router.push(`/checkout/${orderRes?.id}`);
    } catch (err: any) {
        console.log(err.info?.message ?? err);
    }
};
</script>

<template>
    <UDashboardPanelContent>
        <div class="flex flex-row">
            <div class="flex flex-col w-1/2 me-10">
            <CheckoutContact
                @update="contactValue"
                :address="address"
            />
            <UDashboardToolbar class="py-0 px-1.5 overflow-x-auto">
                <UHorizontalNavigation :links="links" />
            </UDashboardToolbar>
            <div class="p-4" v-if="payToggle === 'offline'">
                <div>Name: {{ offlineInfo?.accHolderName}}</div>
                <div>Sort Code: {{ offlineInfo?.sortCode}}</div>
                <div>Account Number: {{ offlineInfo?.accountNo}}</div>
                <div>Bank Name: {{ offlineInfo?.bankName}}</div>
            </div>
        </div>
            <div class="w-1/2">
                <h2 class="text-xl font-semibold mb-5">Order summary</h2>
                <div
                    class="rounded-lg border dark:border-gray-800 border-gray-400"
                >
                    <CheckoutItem @update="priceValue" />
                    <div
                        class="border-t dark:border-gray-800 border-gray-400 px-4 py-6 sm:px-6"
                    >
                        <UButton
                            class="w-full flex items-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                            @click="handleSubmit"
                        >
                            Confirm order
                        </UButton>
                    </div>
                </div>
            </div>
        </div>
    </UDashboardPanelContent>
</template>
