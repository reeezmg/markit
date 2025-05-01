<script setup lang="ts">
import { ref } from 'vue';
import AwsService from '~/composables/aws';
import {
    useUpdatePurchaseOrder,
    useDeletePurchaseOrder,
} from '~/lib/hooks';

const UpdatePurchaseOrder = useUpdatePurchaseOrder();
const DeletePurchaseOrder = useDeletePurchaseOrder();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;

const isFormModalOpen = ref(false);

watch(isFormModalOpen, (newVal, oldVal) => {
  if (newVal) {
    console.log('Modal opened');
    // You can also do something like reset form here
  } else {
    console.log('Modal closed');
    // Or trigger refetch or cleanup
  }
});

</script>

<template>
    <UDashboardPanelContent class="pb-24">
            <div>
                <DistributorList @modal-toggle="isFormModalOpen = !isFormModalOpen"/>

                <DistributorForm v-model="isFormModalOpen"/>
            </div>
    </UDashboardPanelContent>
</template>
