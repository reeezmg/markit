<script setup lang="ts">
import { z } from 'zod';
import type { FormError } from '#ui/types';
import { storeToRefs } from 'pinia';

import {
  useCreateBill,
  useCreateProduct,
  useUpdateAddress,
  useFindFirstCompany,
  useUpdateVariant,
  useCreateAddress
} from '~/lib/hooks';

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

const activeAddressId = ref('');
const total = ref(0);
const discount = ref(0);
const subtotal = ref(0);
const deliveryFees = ref(0);
const bookingDate = ref([]);
const paymentMethod = ref('');
const type = ref('');
const items = ref([]);

const { $razorpay } = useNuxtApp();

const contactValue = (data: any) => {
  activeAddressId.value = data;
};

const priceValue = (data: any) => {
  total.value = data.total;
  discount.value = data.discount;
  subtotal.value = data.subtotal;
  paymentMethod.value = data.paymentMethod;
  type.value = data.checkoutOption;
  bookingDate.value = data.bookingDate;
  deliveryFees.value = data.deliveryFees;
  items.value = data.items;
};

const {
  data: company,
} = useFindFirstCompany({ where: { name: route.params.company }, select: { id: true } });

const handleSubmit = async (e?: Event) => {
  e?.preventDefault?.();

  if (!activeAddressId.value && type.value !== 'BOOKING') {
    toast.add({
      title: 'Fill in address',
      id: 'modal-error',
      color: 'red',
    });
    return;
  }

  try {
    const updatePromises = items.value.map(async item => {
      const updatedQty = item.totalQty - item.qty;
      const updatedSizes = item.sizes.map(sizeData =>
        sizeData.size === item.size
          ? { ...sizeData, qty: Math.max(sizeData.qty - 1, -1) }
          : sizeData
      );

      const selectedSize = updatedSizes.find(size => size.size === item.size);
      if (updatedQty === -1 || selectedSize?.qty === -1) {
        toast.add({
          title: `${item.pName} - ${item.vName} got out of stock`,
          id: 'modal-error',
          color: 'red',
        });
        throw new Error('Item is out of stock');
      }

      return UpdateVariant.mutateAsync({
        where: { id: item.variantId },
        data: { qty: updatedQty, sizes: updatedSizes },
      });
    });

    await Promise.all(updatePromises);

    const billData = {
      ...(type.value !== 'BOOKING' && {
        grandTotal: total.value,
        discount: discount.value,
        subtotal: subtotal.value,
        paymentMethod: paymentMethod.value,
        deliveryFees: deliveryFees.value,
        paymentStatus: 'PAID',
        ...(type.value === 'BOOKING' && {
          paymentStatus: 'PENDING',
        }),
        address: {
          connect: { id: activeAddressId.value },
        },
      }),
      createdAt: new Date().toISOString(),
      status: 'CONFIRMED',
      type: type.value,
      ...(type.value === 'BOOKING' && {
        bookingDate: new Date(bookingDate.value).toISOString(),
      }),
      company: {
        connect: {
          id: company.value?.id,
        },
      },
      ...(useClientAuth().session.value?.id && {
        client: {
          connect: {
            id: useClientAuth().session.value?.id,
          },
        },
      }),
      entries: {
        create: items.value.map(item => ({
          name: `${item.pName}-${item.vName}`,
          qty: item.qty,
          size: item.size,
          rate: item.value,
          discount: item.discount,
          tax: item.tax,
          value: item.value,
          ...(item.categoryId && {
            category: { connect: { id: item.categoryId } },
          }),
          ...(item.variantId && {
            variant: { connect: { id: item.variantId } },
          }),
        })),
      },
    };

    await CreateBill.mutateAsync({ data: billData });
    await $fetch('/api/notifications/notify', {
      method: 'POST',
      body: {
        userId:useAuth().session.value?.id,
        type: 'ORDER',
        companyId: useAuth().session.value?.companyId,
        id: data.id,
        invoiceNumber: data.invoiceNumber,
        amount: data.grandTotal
      }
    })

    toast.add({ title: 'Order Confirmed!', id: 'modal-success' });
    cartStore.clear();
    router.push('.');
  } catch (err: any) {
    console.error(err.info?.message ?? err);
  }
};

const initiatePayment = async (method: string) => {
  try {
    paymentMethod.value = method;

    // Load Razorpay script first
    await $razorpay.load();
    if (!window.Razorpay) {
      toast.add({ title: 'Razorpay script not loaded', color: 'red' });
      return;
    }

    // Create order
    const res = await $fetch('/api/create-order', {
      method: 'POST',
      body: {
        amount: total.value * 100, // in paise
        method,
      },
    });

    const options = {
      key: 'rzp_test_6SpABoo17DzC1t', // Replace with your live key in production
      amount: res.amount,
      currency: 'INR',
      name: 'Your Store Name',
      description: 'Order Payment',
      order_id: res.id,
      handler: async function (response: any) {
        // Payment successful
        await handleSubmit(); // Now create bill
        toast.add({ title: 'Payment successful!', color: 'green' });
      },
      prefill: {
        email: useClientAuth().session.value?.email || '',
        phone: useClientAuth().session.value?.phone || '',
      },
      method: {
        netbanking:  method === 'upi',
        card: method === 'card',
        upi: method === 'upi',
        wallet: method === 'upi',
      },
      theme: { color: '#3399cc' },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  } catch (err) {
    console.error('Payment error:', err);
    toast.add({ title: 'Payment failed', color: 'red' });
  }
};
</script>

<template>
    <UDashboardPanelContent >
        <EmptyCart v-if="cart.length === 0" />
        <div v-else class="grid lg:grid-cols-2 gap-8 w-full ">
            <div >
                <UCard >
                <h2 class="text-xl font-semibold mb-5">Order summary</h2>
                <div class="">
                    <CheckoutItem @update="priceValue" />
                    
                    
                </div>
              
            </UCard>
            </div>


            <div >
            <UCard  v-if="(useClientAuth().session.value?.type === 'CLIENT' && useClientAuth().session.value?.id) && type !== 'BOOKING'" class="mb-7">
                <CheckoutContact
                    @update="contactValue"
                />
            </UCard>
            <div v-if="useClientAuth().session.value?.type === 'USER' || !useClientAuth().session.value?.id" class="mb-7" >
                <UCard>
                    <template #header>
                    <div class="font-semibold text-center">Login to order</div>
                </template>
                <CheckoutLogin />
            </UCard>
            </div>

            <div  v-if="useClientAuth().session.value?.id" class="border dark:border-gray-800 rounded-lg border-gray-200 px-4 py-6 sm:px-6">
              
                  <UButton 
                  v-if="type === 'BOOKING'"
                  class="w-full flex items:cart-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" 
                  color="blue" 
                  icon="i-mdi-qrcode-scan" 
                  @click="() => handleSubmit()"
                  >
                Book Now
                </UButton>

                        <UButton 
                        class="w-full flex items:cart-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" 
                        color="blue" 
                        icon="i-mdi-qrcode-scan" 
                        @click="() => initiatePayment('upi')"
                        >
                        Pay with UPI
                        </UButton>
                        <UDivider class="py-2" label="OR" />
                        <UButton 
                            class="w-full flex items:cart-center justify-center rounded-md border border-transparent px-4 py-3 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" 
                            color="green" 
                            icon="i-tabler-credit-card"
                            @click="() => initiatePayment('card')"
                        >
                            Pay with Credit/Debit Card
                        </UButton>
             </div>

        </div>
          
            
        </div>
    </UDashboardPanelContent>
</template>
