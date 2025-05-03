<script setup lang="ts">
import { ref } from 'vue';

const openModal = ref(false);

watch(openModal, (newVal, oldVal) => {
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
                <DistributorList @modal-open="openModal = true"/>

                <DistributorForm v-model="openModal"/>
            </div>
    </UDashboardPanelContent>
</template>
