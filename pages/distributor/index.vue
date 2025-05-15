<script setup lang="ts">
import { ref } from 'vue';

const openModal = ref(false);
const selectedSupplier = ref<any | null>(null);

const openForm = (supplier = null) => {
    selectedSupplier.value = supplier;
    openModal.value = true;
    console.log(supplier)
};

const closeForm = () => {
    openModal.value = false;
    selectedSupplier.value = null;
};


</script>

<template>
    <UDashboardPanelContent class="pb-24">
            <div>
                <DistributorDlist @modal-open="openForm" @edit="openForm"/>
                <UModal v-model="openModal">
                   <DistributorForm :selectedSupplier = "selectedSupplier"/>
                </UModal>
               
            </div>
    </UDashboardPanelContent>
</template>
