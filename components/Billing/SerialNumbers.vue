<script setup lang="ts">
import { useId } from 'vue';
const formId = 'billing-unit-' + useId();
const props = defineProps<{ item: any; covered: boolean; owned: any[]; returnedUnitIds: string[]; disabled?: boolean }>();
const emit = defineEmits<{ details: [value: { serialNumber: string; deliveredOn: string; installedOn: string }[]]; 'update:returnedUnitIds': [value: string[]] }>();
const open = ref(false);
const details = ref<{ serialNumber: string; deliveredOn: string; installedOn: string }[]>([]);
const draftReturns = ref<string[]>([]);
const count = computed(() => Math.max(0, Math.min(10000, Math.trunc(Number(props.item.qty) || 0))));
const returnOptions = computed(() => props.owned.filter(product => product.item_id === props.item.id));
const selectedReturns = computed(() => props.returnedUnitIds.filter(id => returnOptions.value.some(product => product.id === id)));
function show() {
    details.value = Array.from({ length: count.value }, (_, unit) => ({
        serialNumber: props.item.serviceSerialNumbers?.[unit] || '',
        deliveredOn: props.item.serviceDeliveredDates?.[unit] || '',
        installedOn: props.item.serviceInstalledDates?.[unit] || '',
    }));
    draftReturns.value = [...selectedReturns.value]; open.value = true;
}
function selectReturns(ids: string[]) {
    emit('update:returnedUnitIds', [...props.returnedUnitIds.filter(id => !returnOptions.value.some(product => product.id === id)), ...ids]);
}
function confirm() {
    if (props.disabled) return;
    if (props.covered) emit('details', details.value.map(unit => ({ ...unit })));
    if (props.item.return) selectReturns(draftReturns.value);
    open.value = false;
}
watch(() => [props.item.id, props.item.qty, props.item.serviceLineKey, props.item.return], () => { open.value = false; });
</script>
<template>
  <UButton icon="i-heroicons-identification" color="gray" variant="ghost" size="xs" square title="Serial number and activation dates" aria-label="Serial number and activation dates" :disabled="disabled || !item.id || count < 1" @click="show" />
  <UModal v-model="open" :ui="{width: 'sm:max-w-xl'}">
    <UCard>
      <template #header><div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">Serial number and activation dates</h2><p class="mt-1 text-sm text-gray-500">{{ item.name }}</p></div><UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" aria-label="Close unit details" @click="open=false" /></div></template>
      <form :id="formId" class="space-y-5" @submit.prevent="confirm">
        <fieldset v-if="covered" :disabled="disabled" class="max-h-[60vh] space-y-5 overflow-y-auto">
          <div v-for="(unit, index) in details" :key="index" class="space-y-4">
            <h3 v-if="details.length > 1" class="text-sm font-semibold">Unit {{ index + 1 }}</h3>
            <UFormGroup label="Serial number"><UInput v-model="unit.serialNumber" maxlength="200" :aria-label="'Unit ' + (index + 1) + ' serial number'" /></UFormGroup>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2"><UFormGroup label="Delivery date"><UInput v-model="unit.deliveredOn" type="date" :aria-label="'Unit ' + (index + 1) + ' delivery date'" /></UFormGroup><UFormGroup label="Installation date"><UInput v-model="unit.installedOn" type="date" :aria-label="'Unit ' + (index + 1) + ' installation date'" /></UFormGroup></div>
          </div>
        </fieldset>
        <UFormGroup v-else-if="item.return && returnOptions.length" label="Returned units"><USelectMenu v-model="draftReturns" :options="returnOptions.map(product => ({ value: product.id, label: product.serial_number || product.reference }))" multiple value-attribute="value" option-attribute="label" placeholder="Select returned units" :disabled="disabled" /></UFormGroup>
        <UAlert v-else color="gray" title="No after-sales units for this item" description="Link an after-sales plan to this product to register its unit details." />
        <p class="text-xs text-gray-500">Details are saved when you save the bill.</p>
      </form>
      <template #footer><div class="flex justify-end gap-2"><UButton color="white" @click="open=false">Cancel</UButton><UButton type="submit" :form="formId" :disabled="disabled">Confirm</UButton></div></template>
    </UCard>
  </UModal>
</template>
