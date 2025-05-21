
<script setup lang="ts">
import { z } from 'zod';
import type { FormError } from '#ui/types';
import { storeToRefs } from 'pinia';
// import type { Bill, Company, Variant, Address, Client } from '~/types'; // Adjust import path as needed
import {
  useCreateBill,
  useCreateProduct,
  useUpdateAddress,
  useFindFirstCompany,
  useUpdateVariant,
  useCreateAddress
} from '~/lib/hooks';

import type { PaymentStatus, paymentType,OrderStatus } from '@prisma/client';

// Define interfaces for your data structures
interface CartItem {
  id: string;
  variantId: string;
  pName: string;
  vName: string;
  size: string;
  qty: number;
  totalQty: number;
  sizes: Array<{
    size: string;
    qty: number;
  }>;
  value: number;
  discount: number;
  tax: number;
  categoryId?: string;
}

interface PriceData {
  total: number;
  discount: number;
  subtotal: number;
  paymentMethod: string;
  checkoutOption: string;
  bookingDate: Date[];
  deliveryFees: number;
  items: CartItem[];
}

interface NotificationPayload {
  type: string;
  companyId?: string;
  id?: string;
  invoiceNumber?: number;
  amount?: number;
}

// Hooks
const CreateBill = useCreateBill();
const UpdateAddress = useUpdateAddress();
const CreateAddress = useCreateAddress();
const UpdateVariant = useUpdateVariant();
const CreateProduct = useCreateProduct();
const useClientAuth = () => useNuxtApp().$authClient;
const toast = useToast();
const cartStore = useCartStore();
const router = useRouter();
const route = useRoute();
const { items: cart } = storeToRefs(cartStore);

// Refs with proper typing
const activeAddressId = ref<string>('');
const total = ref<number>(0);
const discount = ref<number>(0);
const subtotal = ref<number>(0);
const deliveryFees = ref<number>(0);
const bookingDate = ref<Date[]>([]);
const paymentMethod = ref<string>('');
const type = ref<string>('');
const items = ref<CartItem[]>([]);
// const companyId = useAuth().session.value?.companyId;


const { $razorpay } = useNuxtApp();

const contactValue = (data: string) => {
  activeAddressId.value = data;
};

const priceValue = (data: PriceData) => {
  total.value = data.total;
  discount.value = data.discount;
  subtotal.value = data.subtotal;
  paymentMethod.value = data.paymentMethod;
  type.value = data.checkoutOption;
  bookingDate.value = data.bookingDate;
  deliveryFees.value = data.deliveryFees;
  items.value = data.items;
};

const companyName = computed(() => {
  const param = route.params.company;
  return Array.isArray(param) ? param[0] : param;
});

const enabled = computed(() => !!companyName.value);

const { data: company, isLoading, error } = useFindFirstCompany(() => ({
  where: {
    name: {
      equals: companyName.value,
      mode: 'insensitive',
    },
  },
  select: { id: true },
}), { enabled });

const companyId = computed(() => company.value?.id);


const handleSubmit = async (e?: Event) => {
  e?.preventDefault?.();
  console.log('companyId: ',companyId.value)
  console.log('company query :',company.value?.id)
  if (!companyId.value) {
  throw new Error("Company ID is missing. Ensure the user is properly authenticated and has a valid company.");
}


  if (!activeAddressId.value && type.value !== 'BOOKING') {
    toast.add({
      title: 'Fill in address',
      id: 'modal-error',
      color: 'red',
    });
    return;
  }

  if (!items.value || !Array.isArray(items.value)) {
      throw new Error('No items in cart');
    }

  try {
    console.log('items',items)
    const updatePromises = items.value.map(async (item) => {
      // For items with size information
      if (item.size !== null && item.sizes !== null) {
        const updatedQty = item.totalQty - item.qty;
        const updatedSizes = item.sizes.map(sizeData => 
          sizeData.size === item.size
            ? { ...sizeData, qty: Math.max(sizeData.qty - item.qty, -1) }
            : sizeData
        );

        const selectedSize = updatedSizes.find(size => size.size === item.size);
        if (updatedQty < 0 || (selectedSize?.qty ?? -1) < 0) {
          toast.add({title:'Out of Stock', id: 'modal-error',color:'red'})
          throw new Error(`${item.pName} - ${item.vName} (Size: ${item.size}) is out of stock`);
        }

        return UpdateVariant.mutateAsync({
          where: { id: item.variantId },
          data: { sizes: updatedSizes }, // Only update sizes for sized items
        });
      }
      // For non-sized items
      else {
        const updatedQty = item.totalQty - item.qty;
        if (updatedQty < 0) {
          toast.add({title:'Out of Stock', id: 'modal-error',color:'red'})
          throw new Error(`${item.pName} - ${item.vName} is out of stock`);
        }

        return UpdateVariant.mutateAsync({
          where: { id: item.variantId },
          data: { qty: updatedQty }, // Only update quantity for non-sized items
        });
      }
    });

    await Promise.all(updatePromises);

    // Create the bill data with proper typing
    const billData = {
      grandTotal: total.value,
      discount: discount.value,
      subtotal: subtotal.value,
      paymentMethod: paymentMethod.value,
      deliveryFees: deliveryFees.value,
      paymentStatus: (type.value === 'BOOKING' ? 'PENDING' : 'PAID') as PaymentStatus,
      ...(type.value !== 'BOOKING' && activeAddressId.value && {
        address: { connect: { id: activeAddressId.value } },
      }),
      createdAt: new Date(),
      status: 'CONFIRMED' as OrderStatus,
      type: type.value as 'STANDARD' | 'BOOKING' | 'TRY_AT_HOME' | 'BILL',
      ...(type.value === 'BOOKING' && bookingDate.value.length > 0 && {
        bookingDate: new Date(bookingDate.value[0]),
      }),
      
    company: {
      connect: { id: companyId.value }
    }
  ,
      ...(useClientAuth().session.value?.id && {
        client: { connect: { id: useClientAuth().session.value?.id } },
      }),
      entries: {
        create: items.value.map(item => ({
          name: `${item.pName}-${item.vName}`,
          qty: item.qty,
          ...(item.size && { size: item.size }),
          rate: item.value,
          discount: item.discount,
          tax: item.tax,
          value: item.value,
          ...(item.categoryId && { category: { connect: { id: item.categoryId } } }),
          ...(item.variantId && { variant: { connect: { id: item.variantId } } }),
        })),
      },
    };
    
    const data = await CreateBill.mutateAsync({ data: billData });
    
    if (!data) {
      throw new Error('Failed to create bill: no data returned');
    }

    // Prepare notification payload with proper null checks
    const notificationPayload = {
      type: 'ORDER',
      companyId: companyId.value,
      id: data.id,
      invoiceNumber: data.invoiceNumber ?? undefined, // Convert null to undefined
      amount: data.grandTotal ?? undefined // Convert null to undefined
    };

    await $fetch('/api/notifications/notify', {
      method: 'POST',
      body: notificationPayload
    });

    toast.add({ title: 'Order Confirmed!', id: 'modal-success' });
    cartStore.clearCart();
    router.push('.');
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : 'An unknown error occurred');
    toast.add({ title: 'Error processing order', color: 'red',description: err instanceof Error ? err.message : 'An unknown error occurred'});
  }
};


const initiatePayment = async (method: string) => {
  try {
    paymentMethod.value = method;

    if (method === 'COD') {
      await handleSubmit();
      // toast.add({ title: 'Order placed with COD!', color: 'green' });
      return;
    }

    await $razorpay.load();
    if (!window.Razorpay) {
      toast.add({ title: 'Razorpay script not loaded', color: 'red' });
      return;
    }

    const res = await $fetch<{ id: string; amount: number }>('/api/create-order', {
      method: 'POST',
      body: {
        amount: total.value * 100,
        method,
      },
    });

    const options = {
      key: 'rzp_test_6SpABoo17DzC1t',
      amount: res.amount,
      currency: 'INR',
      name: 'Your Store Name',
      description: 'Order Payment',
      order_id: res.id,
      handler: async function (response: any) {
        await handleSubmit();
        toast.add({ title: 'Payment successful!', color: 'green' });
      },
      prefill: {
        email: useClientAuth().session.value?.email || '',
        phone: useClientAuth().session.value?.phone || '',
      },
      theme: { color: '#3399cc' },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  } catch (err: unknown) {
    console.error('Payment error:', err instanceof Error ? err.message : err);
    toast.add({ title: 'Payment failed', color: 'red' });
  }
};
</script>

<template>
    <UDashboardPanelContent>
        <EmptyCart v-if="cart.length === 0" />
        <div v-else class="grid lg:grid-cols-2 gap-8 w-full">
            <div>
                <UCard>
                <h2 class="text-xl font-semibold mb-5">Order summary</h2>
                <div class="">
                    <CheckoutItem @update="priceValue" />
                </div>
            </UCard>
            </div>

            <div>
                <UCard v-if="(useClientAuth().session.value?.type === 'CLIENT' && useClientAuth().session.value?.id) && type !== 'BOOKING'" class="mb-7">
                    <CheckoutContact @update="contactValue" />
                </UCard>
                
                <div v-if="useClientAuth().session.value?.type === 'USER' || !useClientAuth().session.value?.id" class="mb-7">
                    <UCard>
                        <template #header>
                            <div class="font-semibold text-center">Login to order</div>
                        </template>
                        <CheckoutLogin />
                    </UCard>
                </div>

                <div v-if="useClientAuth().session.value?.id" class="border dark:border-gray-800 rounded-lg border-gray-200 px-4 py-6 sm:px-6">
                    <UButton 
                        v-if="type === 'BOOKING'"
                        class="w-full flex items-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" 
                        color="blue" 
                        icon="i-mdi-qrcode-scan" 
                        @click="handleSubmit"
                    >
                        Book Now
                    </UButton>

                    <template v-if="paymentMethod !== 'COD'">
                        <UButton 
                            class="w-full flex items-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" 
                            color="blue" 
                            icon="i-mdi-qrcode-scan" 
                            @click="() => initiatePayment('upi')"
                        >
                            Pay with UPI
                        </UButton>
                        <UDivider class="py-2" label="OR" />
                        <UButton 
                            class="w-full flex items-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" 
                            color="green" 
                            icon="i-tabler-credit-card"
                            @click="() => initiatePayment('card')"
                        >
                            Pay with Credit/Debit Card
                        </UButton>
                        <UDivider class="py-2" label="OR" />
                    </template>

                    <UButton 
                        class="w-full flex items-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 mt-2" 
                        color="gray" 
                        icon="i-mdi-cash"
                        @click="() => initiatePayment('COD')"
                    >
                        Cash on Delivery (COD)
                    </UButton>
                </div>
            </div>
        </div>
    </UDashboardPanelContent>
</template>
