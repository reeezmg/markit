
<script setup lang="ts">
import { useFindManyVariant } from '~/lib/hooks';
import { storeToRefs } from 'pinia';
import { ref, computed, watchEffect } from 'vue';
import dayjs from 'dayjs';
import type { CartItem } from '~/types';
import { useToast } from '#imports'

import type { JsonValue } from '@prisma/client/runtime/library';

const loading = ref(false)
const toast = useToast()


const cartStore = useCartStore();
const { items } = storeToRefs(cartStore) as { items: Ref<CartItem[]> }
const emit = defineEmits(['update']);

const variantIds = [...new Set(items.value.map((item) => item.variantId))];




const {
    data: variants,
    isLoading,
    error,
    refetch,
} = useFindManyVariant({
    where: {
        id: {
            in: variantIds,
        },
    },
    select: {
        id: true,
        name: true,
        sprice: true,
        dprice: true,
        images: true,
        qty: true,
        sizes: true,
        discount: true,
        product: {
            select: {
                name: true,
                category: {
                    select: {
                        id: true,
                    },
                },
            },
        },
    },
});

const taxes = ref(5.0);
const discount = ref(0);
const promoCode = ref('');
const checkoutOption = ref({ label: 'Standard Purchase', value: 'STANDARD' });
const paymentMethod = ref<{ label: string; value: string }>({ label: 'COD', value: 'COD' });
const selectedDate = ref(dayjs().add(1, 'day').format('YYYY-MM-DD'));

const shipping = computed(() => {
    if (checkoutOption.value.value === 'BOOKING') return 0.0;
    else return 5.0;
});

const subtotal = computed(() => {
    if (!variants.value) return 0.0;
    if (checkoutOption.value.value === 'TRY_AT_HOME' || checkoutOption.value.value === 'BOOKING') return 0.0;
    const total = items.value.reduce((acc, cartItem) => {
        const product = variants.value.find((p) => p.id === cartItem.variantId);

        if (product) {
            const qty = cartItem.qty || 1;
            const price = product.sprice || 0;
            acc += price * qty;
        }

        return acc;
    }, 0);

    return parseFloat(total.toFixed(2));
});

const totalDiscount = computed(() => {
    if (!variants.value) return 0;

    const discountAmount = items.value.reduce((acc, cartItem) => {
        const variant = variants.value.find((p) => p.id === cartItem.variantId);
        if (variant && variant.discount) {
            acc += ((variant.sprice || 0) * (variant.discount / 100)) * (cartItem.qty || 1);
        }
        return acc;
    }, 0);

    return parseFloat(discountAmount.toFixed(2));
});

const total = computed(() => {
    if (!variants.value) return 0.0;

    const totalValue = subtotal.value + shipping.value - totalDiscount.value;
    return parseFloat(totalValue.toFixed(2));
});

const applyPromoCode = async () => {
  if (!promoCode.value.trim()) {
    return toast.add({ title: 'Enter a promo code', color: 'red' })
  }

  loading.value = true
  const toastId = toast.add({ title: 'Verifying promo code…', color: 'blue', timeout: 0 })

  try {
    const res = await $fetch<{ discountPercent?: number; error?: string }>(
      '/api/applyPromoCode',
      {
        method: 'POST',
        body: { code: promoCode.value.trim()  },
      }
    )

    toast.remove(toastId.id)

    if (res.error) {
      toast.add({ title: res.error, color: 'red' })
    } else {
      toast.add({
        title: `Promo applied! ${res.discountPercent}% off`,
        color: 'green',
      })
      // apply the discount to your cart total…
    }
  } catch (err) {
    toast.remove(toastId.id)
    toast.add({ title: 'Network error', color: 'red' })
  } finally {
    loading.value = false
  }
}


const removeAll = (cartItem: CartItem) => {
    cartStore.removeFromCart(cartItem);
};

const increment = (cartItem: CartItem) => {
    cartStore.incrementQty(cartItem);
};

const decrement = (cartItem: CartItem) => {
    cartStore.decrementQty(cartItem);
};

const availableDates = computed(() => [
    dayjs().add(1, 'day').format('YYYY-MM-DD'),
    dayjs().add(2, 'day').format('YYYY-MM-DD')
]);

const checkoutOptions = [
    { label: 'Standard Purchase', value: 'STANDARD' },
    { label: 'Product Booking', value: 'BOOKING' },
    { label: 'Try-at-home', value: 'TRY_AT_HOME' },
];

const paymentMethodsOptions = [
    { label: 'COD', value: 'COD' },
    { label: 'UPI', value: 'UPI' },
    { label: 'CARD', value: 'CARD' },
];

const paymentMethods = computed(() => {
    if (checkoutOption.value.value === 'BOOKING') return [paymentMethodsOptions[0]];
    return paymentMethodsOptions;
});

const orderItems = computed(() => {
    if (!variants.value) return [];

    return items.value.map((cartItem) => {
        const variant = variants.value.find((v) => v.id === cartItem.variantId);
        if (!variant) return null;

        const qty = cartItem.qty || 1;
        const size = cartItem.size;
        const sprice = variant.sprice || 0;
        const discount = variant.discount || 0;
        const categoryId = variant.product?.category?.id || null;
        const variantId = variant.id;
        const tax = 0;
        const value = qty * sprice;
        const sizes = variant.sizes;
        const totalQty = variant.qty;
        const vName = variant.name;
        const pName = variant.product.name;

        return {
            vName,
            pName,
            qty,
            sprice,
            discount,
            tax,
            value,
            categoryId,
            variantId,
            sizes,
            totalQty,
            size
        };
    }).filter(Boolean);
});

watchEffect(() => {
    if (variants.value) {
        emit('update', {
            total: total.value,
            subtotal: subtotal.value,
            discount: totalDiscount.value,
            deliveryFees: shipping.value,
            paymentMethod: paymentMethod.value.value ,
            checkoutOption: checkoutOption.value.value,
            bookingDate: checkoutOption.value.value === 'BOOKING' ? selectedDate.value : null,
            items: orderItems.value
        });
    }
});

function n(value: { id: string; name: string; sprice: number; qty: number | null; discount: number | null; dprice: number | null; sizes: JsonValue; images: string[]; product: { name: string; category: { id: string; } | null; }; company: { id: string; }; } & { $optimistic?: boolean | undefined; }, index: number, array: ({ id: string; name: string; sprice: number; qty: number | null; discount: number | null; dprice: number | null; sizes: JsonValue; images: string[]; product: { name: string; category: { id: string; } | null; }; company: { id: string; }; } & { $optimistic?: boolean | undefined; })[]): value is { id: string; name: string; sprice: number; qty: number | null; discount: number | null; dprice: number | null; sizes: JsonValue; images: string[]; product: { name: string; category: { id: string; } | null; }; company: { id: string; }; } & { $optimistic?: boolean | undefined; } {
    throw new Error('Function not implemented.');
}
</script>

<template>
<div class="mt-10 lg:mt-0">
    <div>
        <ul role="list" class="divide-y dark:divide-gray-800 divide-gray-200">
            <li v-for="cartItem in items" :key="`${cartItem.variantId}-${cartItem.size}`" class="flex py-6">
                <div class="flex-shrink-0">
                    <img v-if="variants" :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${variants.find((p) => p.id === cartItem.variantId)?.images[0]}`" class="w-20 h-20 rounded-md" />
                </div>
                <div class="ml-6 flex flex-1 flex-col">
                    <div class="flex justify-between">
                        <div class="min-w-0 flex-1">
                            <h4 class="text-sm">
                                <NuxtLink :to="`products/${cartItem.variantId}`" class="font-medium">
                                    {{ variants?.find((p) => p.id === cartItem.variantId)?.product.name }} - {{ variants?.find((p) => p.id === cartItem.variantId)?.name }}
                                </NuxtLink>
                            </h4>
                            <p v-if="cartItem.size" class="mt-1 text-sm text-gray-500">
                                Size: {{ cartItem.size }}
                            </p>
                        </div>
                        <div class="ml-4 flex items-center">
                            <UButton icon="i-heroicons-trash" @click="removeAll(cartItem)" />
                        </div>
                    </div>
                    <div class="flex items-center justify-between pt-2">
                        <div>
                            <p class="text-sm font-medium">
                                    <span v-if="variants?.find((p) => p.id === cartItem.variantId)?.discount">
                                          <del class="text-gray-400">₹{{ variants?.find((p) => p.id === cartItem.variantId)?.sprice }}</del>
                                          <span class="ml-1 text-green-500">
                                            ₹{{ (variants?.find((p) => p.id === cartItem.variantId)?.sprice || 0) * (1 - ((variants?.find((p) => p.id === cartItem.variantId)?.discount || 0) / 100)) }}
                                          </span>
                                        </span>

                                <span v-else>
                                    ₹{{ variants?.find((p) => p.id === cartItem.variantId)?.sprice }}
                                </span>
                            </p>
                        </div>
                        <div class="flex items-center gap-3">
                            <button @click="decrement(cartItem)" class="px-2 py-1 border rounded-md">-</button>
                            <span class="text-sm">{{ cartItem.qty }}</span>
                            <button @click="increment(cartItem)" class="px-2 py-1 border rounded-md">+</button>
                        </div>
                    </div>
                </div>
            </li>
        </ul>

        <UFormGroup label="Checkout" name="checkoutOption" class="mb-5">
            <USelectMenu v-model="checkoutOption" :options="checkoutOptions" />
        </UFormGroup>

        <div v-if="checkoutOption.value === 'BOOKING'" class="mb-5">
            <UFormGroup label="Booking Date" name="date">
                <USelectMenu v-model="selectedDate" :options="availableDates" />
            </UFormGroup>
        </div>

        <div v-if="checkoutOption.value !== 'BOOKING'" class="flex items-end mb-5">
  <UFormGroup class="flex-grow" label="Promo Code" name="promoCode">
    <UInput
      v-model="promoCode"
      placeholder="Enter Promo Code"
      @keydown.enter.prevent="applyPromoCode"
    />
  </UFormGroup>

  <UButton
    class="ml-3"
    :label="loading ? 'Applying...' : 'Apply'"
    :disabled="!promoCode || loading"
    :loading="loading"
    @click="applyPromoCode"
  />
</div>


        <UFormGroup v-if="checkoutOption.value !== 'BOOKING'" label="Payment" name="paymentMethods" class="mb-5">
            <USelectMenu v-model="paymentMethod" :options="paymentMethods" />
        </UFormGroup>

        <dl v-if="checkoutOption.value !== 'BOOKING'" class="rounded-lg border dark:border-gray-800 border-gray-200 space-y-6 border-t px-4 py-6 sm:px-6 mt-5">
            <div class="flex items-center justify-between">
                <dt class="text-sm">Subtotal</dt>
                <dd class="text-sm font-medium">₹{{ subtotal }}</dd>
            </div>
            <div class="flex items-center justify-between">
                <dt class="text-sm">Shipping</dt>
                <dd class="text-sm font-medium">₹{{ shipping }}</dd>
            </div>
            <div class="flex items-center justify-between">
                <dt class="text-sm">Discount</dt>
                <dd class="text-sm font-medium">- ₹{{ totalDiscount }}</dd>
            </div>
            <div class="flex items-center justify-between border-t pt-6">
                <dt class="text-base font-medium">Total</dt>
                <dd class="text-base font-medium">₹{{ total }}</dd>
            </div>
        </dl>
    </div>
</div>
</template>
