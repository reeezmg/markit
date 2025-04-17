
<script setup>
import { useFindManyOrder,useUpdateOrder,useUpdateOrderProduct } from '~/lib/hooks';
const UpdateOrder = useUpdateOrder();
const UpdateOrderProduct = useUpdateOrderProduct();
const useAuth = () => useNuxtApp().$auth;
const visibleOrder = ref(null);


const todoStatus = [
    {
        key: 'inactive',
        label: 'Inactive',
        value: false,
    },
    {
        key: 'active',
        label: 'Active',
        value: true,
    },
];
</script>

<template>
  <UDashboardPanelContent>
   <div class="flex flex-row">
    <div class="w-1/2">
        <UTextarea rows=10 placeholder="Content" />
    </div>
    <div class=" ms-14">
        <USelectMenu
                        v-model="selectedStatus"
                        :options="todoStatus"
                        multiple
                        placeholder="Pipeline"
                        class="w-40"
                    />
                    <UButton
                        class="mt-5"
                        icon="i-heroicons-chevron-right"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Send Campaign"
                    />
    </div>
   </div>
    </UDashboardPanelContent>
  </template>
  