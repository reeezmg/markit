<script setup lang="ts">
definePageMeta({ auth: true });

const statusFilter = ref('Open');
const typeFilter = ref('All');

const tabs = [
  { label: 'Open', value: 'Open' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Closed', value: 'Closed' },
];

const requestTypes = [
  { label: 'All', value: 'All' },
  { label: 'Cancellation', value: 'Cancellation' },
  { label: 'Return', value: 'Return' },
  { label: 'Exchange', value: 'Exchange' },
  { label: 'Refund', value: 'Refund' },
];

const summary = [
  { label: 'Cancellations', value: 0, description: 'Before dispatch or as configured' },
  { label: 'Returns', value: 0, description: 'Delivered orders inside return window' },
  { label: 'Exchanges', value: 0, description: 'Replacement requests and stock checks' },
  { label: 'Refunds', value: 0, description: 'Pending payout or manual settlement' },
];

const columns = [
  { key: 'requestNo', label: 'Request #' },
  { key: 'orderNo', label: 'Order #' },
  { key: 'type', label: 'Type' },
  { key: 'customer', label: 'Customer' },
  { key: 'reason', label: 'Reason' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created' },
  { key: 'actions', label: 'Actions' },
];

const rows = computed(() => {
  const data: any[] = [];
  return data.filter((row) => {
    const matchesStatus = statusFilter.value === 'All' || row.status === statusFilter.value;
    const matchesType = typeFilter.value === 'All' || row.type === typeFilter.value;
    return matchesStatus && matchesType;
  });
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Requests</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review cancellation, return, exchange, and refund requests from ecommerce orders.
        </p>
      </div>
      <UButton
        to="/settings/requests"
        icon="i-heroicons-cog-6-tooth"
        color="gray"
        variant="soft"
      >
        Request settings
      </UButton>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <UCard v-for="item in summary" :key="item.label">
        <div class="space-y-1">
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ item.label }}</p>
          <p class="text-3xl font-semibold text-gray-900 dark:text-white">{{ item.value }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ item.description }}</p>
        </div>
      </UCard>
    </div>

    <UCard>
      <div class="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <UHorizontalNavigation
          :links="tabs.map((tab) => ({ label: tab.label, click: () => statusFilter = tab.value, active: statusFilter === tab.value }))"
        />
        <USelectMenu
          v-model="typeFilter"
          :options="requestTypes"
          option-attribute="label"
          value-attribute="value"
          class="w-full lg:w-56"
        />
      </div>

      <UTable :rows="rows" :columns="columns">
        <template #empty-state>
          <div class="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <UIcon name="i-heroicons-inbox" class="h-10 w-10 text-gray-400" />
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">No requests yet</p>
              <p class="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                Customer cancellation, return, exchange, and refund requests will appear here once the storefront request flow is connected.
              </p>
            </div>
          </div>
        </template>
      </UTable>
    </UCard>
  </div>
</template>
