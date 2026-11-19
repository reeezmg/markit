<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; pickup?: any; order?: any }>();
const emit = defineEmits(['update:modelValue', 'saved']);
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
const toast = useToast();
const requests = ref<any[]>([]);
const requestId = ref('');
const parcels = ref<any[]>([]);
const selected = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const request = computed(() => requests.value.find(row => row.id === requestId.value));
const options = computed(() => requests.value.map(row => ({ value: row.id, label: `${row.carrierPickupId} · ${row.location} · ${row.carrierSchedule?.date || row.requestedPickupDate || row.pickupDate || ''}` })));
let generation = 0;
async function loadParcels() {
  const current = ++generation;
  parcels.value = []; selected.value = []; error.value = '';
  if (!request.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const result: any = await $fetch('/api/ecommerce-cms/pickup/pending', { query: { location: request.value.location, carrier: request.value.carrier } });
    if (current !== generation) return;
    parcels.value = (result.orders || []).filter((row: any) => !props.order || row.orderId === props.order.id);
    selected.value = parcels.value.filter(row => !row.excluded).map(row => row.id);
  } catch (e: any) { if (current === generation) error.value = carrierError(e); }
  finally { if (current === generation) loading.value = false; }
}
watch(requestId, loadParcels, { flush: 'sync' });
watch(open, async value => {
  if (!value) { ++generation; return; }
  ++generation; requestId.value = ''; requests.value = []; parcels.value = []; selected.value = []; error.value = ''; loading.value = true;
  const current = generation;
  try {
    const result: any = await $fetch('/api/ecommerce-cms/pickup/requests');
    if (!open.value || current !== generation) return;
    requests.value = (result.requests || []).filter((row: any) => row.status === 'REQUESTED' && row.carrierPickupId
      && (!props.pickup || row.id === props.pickup.id)
      && (!props.order?.meta?.shipping?.provider || row.carrier === props.order.meta.shipping.provider)
      && (!props.order?.meta?.shipping?.location || row.location === props.order.meta.shipping.location));
    requestId.value = props.pickup?.id || options.value[0]?.value || '';
    if (!requestId.value) loading.value = false;
  } catch (e: any) { if (current === generation) { error.value = carrierError(e); loading.value = false; } }
});
async function save() {
  if (!requestId.value || !selected.value.length || loading.value || saving.value) return;
  saving.value = true;
  try {
    const result: any = await $fetch('/api/ecommerce-cms/pickup/add', { method: 'POST', body: { requestId: requestId.value, shipmentIds: selected.value } });
    toast.add({ title: `${result.added} parcel(s) added to pickup in Markit`, color: 'green' });
    emit('saved'); open.value = false;
  } catch (e: any) { error.value = carrierError(e); }
  finally { saving.value = false; }
}
</script>

<template>
  <UModal v-model="open" :prevent-close="saving">
    <UCard>
      <template #header><h2 class="text-lg font-semibold">Add to existing pickup</h2></template>
      <div class="space-y-4">
        <p class="text-sm text-gray-500">Add ready parcels to Markit's handover list for this warehouse pickup. This does not change the parcel list or expected count in Delhivery One.</p>
        <UFormGroup label="Open pickup"><USelect v-model="requestId" :options="options" :disabled="saving || !!pickup" placeholder="Select pickup" /></UFormGroup>
        <UAlert v-if="error" color="red" :title="error" />
        <p v-if="loading" class="text-sm text-gray-500">Loading available parcels…</p>
        <p v-else-if="!parcels.length" class="text-sm text-gray-500">No eligible parcels for this selection. Parcels must have a waybill, match the carrier and warehouse, and be awaiting pickup without another assignment.</p>
        <div v-else class="max-h-80 space-y-3 overflow-y-auto">
          <UCheckbox v-for="parcel in parcels" :key="parcel.id" v-model="selected" :value="parcel.id" :disabled="saving"
            :label="`Order #${parcel.orderNumber} · ${parcel.awb} · ${parcel.kind}${parcel.excluded ? ' · held back' : ''}`" />
        </div>
      </div>
      <template #footer><div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" :disabled="saving" @click="open = false">Cancel</UButton>
        <UButton :loading="saving" :disabled="loading || !selected.length" @click="save">Add {{ selected.length }} parcel(s)</UButton>
      </div></template>
    </UCard>
  </UModal>
</template>
