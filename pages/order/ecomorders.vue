<script setup lang="ts">
import { format } from 'date-fns';
import { useFindManyEcommOrder } from '~/lib/hooks';

definePageMeta({ auth: true });

const useAuth = () => useNuxtApp().$auth;
const companyId = computed(() => useAuth().session.value?.companyId || '');

const search = ref('');
const statusFilter = ref('All');
const paymentFilter = ref('All');

const statusOptions = ['All', 'PLACED', 'PACKED', 'PICKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const paymentOptions = ['All', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'];

const { data: orders, isLoading, refetch } = useFindManyEcommOrder(
  computed(() => ({
    where: { companyId: companyId.value },
    include: {
      client: {
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },
      bill: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })),
  { enabled: computed(() => Boolean(companyId.value)) },
);

const columns = [
  { key: 'order', label: 'Order' },
  { key: 'createdAt', label: 'Date' },
  { key: 'customer', label: 'Customer' },
  { key: 'items', label: 'Items' },
  { key: 'payment', label: 'Payment' },
  { key: 'status', label: 'Status' },
  { key: 'grandTotal', label: 'Total' },
  { key: 'actions', label: 'Actions' },
];

const money = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const orderLabel = (order: any) => order.orderNumber ? `#${order.orderNumber}` : order.id?.slice(0, 8);

const itemCount = (order: any) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((total, item) => total + Number(item.quantity || item.qty || 1), 0);
};

const firstItems = (order: any) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.slice(0, 3).map((item) => item.name || item.variantName || 'Item').join(', ');
};

const addressLine = (order: any) => {
  const address = order.shippingAddress || {};
  return [
    address.houseDetails,
    address.street,
    address.locality,
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean).join(', ');
};

const badgeColor = (status: string) => {
  if (['PAID', 'DELIVERED', 'PLACED'].includes(status)) return 'green';
  if (['PENDING', 'PACKED', 'PICKED', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(status)) return 'yellow';
  if (['CANCELLED', 'FAILED', 'REFUNDED'].includes(status)) return 'red';
  return 'gray';
};

const shipOpen = ref(false);
const shipOrder = ref<any>(null);
function openShip(order: any) {
  shipOrder.value = order;
  shipOpen.value = true;
}

const filteredOrders = computed(() => {
  const query = search.value.trim().toLowerCase();
  return (orders.value || []).filter((order: any) => {
    const matchesStatus = statusFilter.value === 'All' || order.status === statusFilter.value;
    const matchesPayment = paymentFilter.value === 'All' || order.paymentStatus === paymentFilter.value;
    const searchable = [
      order.orderNumber,
      order.client?.name,
      order.client?.phone,
      order.client?.email,
      order.bill?.invoiceNumber,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    return matchesStatus && matchesPayment && matchesSearch;
  });
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Orders</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ecommerce orders placed from the custom storefront.
        </p>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        color="gray"
        variant="soft"
        :loading="isLoading"
        @click="() => refetch()"
      >
        Refresh
      </UButton>
    </div>

    <UCard>
      <div class="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search order, customer, phone, invoice"
        />
        <USelect v-model="statusFilter" :options="statusOptions" />
        <USelect v-model="paymentFilter" :options="paymentOptions" />
      </div>

      <UTable :rows="filteredOrders" :columns="columns" :loading="isLoading">
        <template #order-data="{ row }">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ orderLabel(row) }}</p>
            <p v-if="row.bill?.invoiceNumber" class="text-xs text-gray-500">
              Bill #{{ row.bill.invoiceNumber }}
            </p>
          </div>
        </template>

        <template #createdAt-data="{ row }">
          <span class="text-sm text-gray-600 dark:text-gray-300">
            {{ format(new Date(row.createdAt), 'dd MMM yyyy, hh:mm a') }}
          </span>
        </template>

        <template #customer-data="{ row }">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ row.client?.name || 'Customer' }}</p>
            <p class="text-xs text-gray-500">{{ row.client?.phone || row.client?.email || '-' }}</p>
          </div>
        </template>

        <template #items-data="{ row }">
          <div class="max-w-xs">
            <p class="text-sm text-gray-900 dark:text-white">{{ itemCount(row) }} item{{ itemCount(row) === 1 ? '' : 's' }}</p>
            <p class="truncate text-xs text-gray-500">{{ firstItems(row) || 'No item snapshot' }}</p>
          </div>
        </template>

        <template #payment-data="{ row }">
          <div class="space-y-1">
            <UBadge :color="badgeColor(row.paymentStatus)" variant="subtle">
              {{ row.paymentStatus }}
            </UBadge>
            <p class="text-xs text-gray-500">{{ row.paymentMethod || '-' }}</p>
          </div>
        </template>

        <template #status-data="{ row }">
          <UBadge :color="badgeColor(row.status)" variant="subtle">
            {{ row.status }}
          </UBadge>
        </template>

        <template #grandTotal-data="{ row }">
          <span class="font-medium text-gray-900 dark:text-white">{{ money(row.grandTotal) }}</span>
        </template>

        <template #actions-data="{ row }">
          <div class="flex items-center gap-1">
          <UButton
            icon="i-heroicons-truck"
            :color="row.meta?.shipping?.awb ? 'primary' : 'gray'"
            variant="ghost"
            :title="row.meta?.shipping?.awb ? `AWB ${row.meta.shipping.awb}` : 'Create shipment'"
            @click="openShip(row)"
          />
          <UPopover>
            <UButton icon="i-heroicons-eye" color="gray" variant="ghost" />
            <template #panel>
              <div class="w-96 max-w-[90vw] space-y-4 p-4">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">Order {{ orderLabel(row) }}</p>
                  <p class="text-xs text-gray-500">Placed {{ format(new Date(row.createdAt), 'dd MMM yyyy, hh:mm a') }}</p>
                </div>
                <div class="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">
                  <p class="font-medium text-gray-900 dark:text-white">Shipping address</p>
                  <p class="mt-1 text-gray-600 dark:text-gray-300">{{ addressLine(row) || 'No address saved' }}</p>
                </div>
                <div>
                  <p class="mb-2 text-sm font-medium text-gray-900 dark:text-white">Items</p>
                  <div class="max-h-56 space-y-2 overflow-y-auto">
                    <div
                      v-for="(item, index) in (Array.isArray(row.items) ? row.items : [])"
                      :key="`${row.id}-${index}`"
                      class="flex justify-between gap-3 rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800"
                    >
                      <div>
                        <p class="font-medium text-gray-900 dark:text-white">{{ item.name || item.variantName || 'Item' }}</p>
                        <p class="text-xs text-gray-500">{{ item.variantName || item.size || '' }}</p>
                      </div>
                      <div class="text-right">
                        <p>Qty {{ item.quantity || item.qty || 1 }}</p>
                        <p class="text-xs text-gray-500">{{ money(item.value || item.dprice || item.sprice) }}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <span class="text-gray-500">Subtotal</span>
                  <span class="text-right">{{ money(row.subtotal) }}</span>
                  <span class="text-gray-500">Discount</span>
                  <span class="text-right">-{{ money(row.discount) }}</span>
                  <span class="text-gray-500">Delivery</span>
                  <span class="text-right">{{ money(row.deliveryFee) }}</span>
                  <span class="font-medium text-gray-900 dark:text-white">Total</span>
                  <span class="text-right font-medium text-gray-900 dark:text-white">{{ money(row.grandTotal) }}</span>
                </div>
              </div>
            </template>
          </UPopover>
          </div>
        </template>

        <template #empty-state>
          <div class="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <UIcon name="i-heroicons-shopping-bag" class="h-10 w-10 text-gray-400" />
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">No ecommerce orders</p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Orders placed from Revomotive will appear here.
              </p>
            </div>
          </div>
        </template>
      </UTable>
    </UCard>

    <ShipOrderModal v-model="shipOpen" :order="shipOrder" @updated="() => { refetch(); }" />
  </div>
</template>
