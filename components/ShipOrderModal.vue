<script setup lang="ts">
import { useFindManyEcommPickupLocation } from '~/lib/hooks';

const props = defineProps<{ modelValue: boolean; order: any }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; updated: [] }>();

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const shipping = computed(() => props.order?.meta?.shipping || null);
const awb = computed(() => shipping.value?.awb || null);
const isCod = computed(() => String(props.order?.paymentMethod || '').toUpperCase() === 'COD');

const { data: pickupLocations } = useFindManyEcommPickupLocation(
  computed(() => ({ where: { companyId: companyId.value, active: true }, orderBy: [{ isDefault: 'desc' }] })),
  { enabled: computed(() => Boolean(companyId.value)) },
);
const locationOptions = computed(() =>
  (pickupLocations.value || []).map((l: any) => ({ label: l.isDefault ? `${l.name} (default)` : l.name, value: l.name })),
);

// ---- create shipment form ----
const createForm = ref({ pickupLocation: '', weight: 0.5, length: 10, width: 10, height: 10 });
watchEffect(() => {
  if (!createForm.value.pickupLocation && locationOptions.value.length) {
    createForm.value.pickupLocation = locationOptions.value[0].value;
  }
});
// Prefill total weight (kg) from the order's item weights when available.
watchEffect(() => {
  const items = Array.isArray(props.order?.items) ? props.order.items : [];
  const w = items.reduce((s: number, i: any) => s + (Number(i.weight) || 0) * (i.quantity || i.qty || 1), 0);
  if (w > 0) createForm.value.weight = Math.round(w * 1000) / 1000;
});

const busy = ref('');
const serviceMsg = ref('');
const trackInfo = ref<any>(null);

function addressParts() {
  const a = props.order?.shippingAddress || {};
  return {
    address: [a.houseDetails, a.street, a.locality].filter(Boolean).join(', '),
    city: a.city || '', state: a.state || '', pincode: a.pincode || '',
  };
}

async function checkServiceability() {
  busy.value = 'service';
  serviceMsg.value = '';
  try {
    const { pincode } = addressParts();
    const res: any = await $fetch('/api/ecommerce-cms/shipping/serviceability', { query: { pincode } });
    serviceMsg.value = res.serviceable
      ? `Serviceable · COD ${res.cod ? 'yes' : 'no'} · Prepaid ${res.prepaid ? 'yes' : 'no'}`
      : `Not serviceable: ${res.remarks || pincode}`;
  } catch (e: any) {
    serviceMsg.value = e.data?.statusMessage || 'Serviceability check failed';
  } finally {
    busy.value = '';
  }
}

async function createShipment() {
  busy.value = 'create';
  try {
    const a = addressParts();
    const body = {
      orderId: props.order.id,
      orderNumber: String(props.order.orderNumber ?? props.order.id),
      customerName: props.order.client?.name || 'Customer',
      customerPhone: props.order.client?.phone || '',
      customerEmail: props.order.client?.email || '',
      deliveryAddress: a.address,
      deliveryCity: a.city,
      deliveryState: a.state,
      deliveryPincode: a.pincode,
      items: Array.isArray(props.order.items) ? props.order.items : [],
      weight: Number(createForm.value.weight) || 0.5,
      length: Number(createForm.value.length) || 10,
      width: Number(createForm.value.width) || 10,
      height: Number(createForm.value.height) || 10,
      paymentMethod: isCod.value ? 'COD' : 'Prepaid',
      codAmount: isCod.value ? Number(props.order.grandTotal || 0) : 0,
      totalAmount: Number(props.order.grandTotal || 0),
      pickupLocation: createForm.value.pickupLocation,
    };
    const res: any = await $fetch('/api/ecommerce-cms/shipping/create', { method: 'POST', body });
    toast.add({ title: `Shipment created · AWB ${res.awb || '—'}`, color: 'green' });
    emit('updated');
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = '';
  }
}

async function generateLabel() {
  busy.value = 'label';
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/label', { query: { trackingId: awb.value } });
    if (res.labelUrl) window.open(res.labelUrl, '_blank');
    else toast.add({ title: 'Label generated (no PDF link returned)', color: 'yellow' });
    emit('updated');
  } catch (e: any) {
    toast.add({ title: 'Label failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = '';
  }
}

async function track() {
  busy.value = 'track';
  try {
    trackInfo.value = await $fetch('/api/ecommerce-cms/shipping/track', { query: { trackingId: awb.value } });
  } catch (e: any) {
    toast.add({ title: 'Track failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = '';
  }
}

async function cancel() {
  busy.value = 'cancel';
  try {
    await $fetch('/api/ecommerce-cms/shipping/cancel', { method: 'POST', body: { awb: awb.value, orderId: props.order.id } });
    toast.add({ title: 'Shipment cancelled', color: 'green' });
    emit('updated');
  } catch (e: any) {
    toast.add({ title: 'Cancel failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = '';
  }
}

// Pickup is a batch action on the Pickup Locations page, not per-order.

// ---- NDR ----
const ndrForm = ref({ action: 'RE-ATTEMPT', remarks: '' });
const ndrActions = ['RE-ATTEMPT', 'DEFER_DELIVERY', 'EDIT_DETAILS'];
async function ndrAct() {
  busy.value = 'ndr';
  try {
    await $fetch('/api/ecommerce-cms/shipping/ndr', { method: 'POST', body: { awb: awb.value, action: ndrForm.value.action, remarks: ndrForm.value.remarks } });
    toast.add({ title: 'NDR action submitted', color: 'green' });
    emit('updated');
  } catch (e: any) {
    toast.add({ title: 'NDR action failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <UModal v-model="open" :ui="{ width: 'sm:max-w-xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Shipping · Order #{{ order?.orderNumber ?? order?.id?.slice(0, 8) }}</h2>
          <UBadge v-if="awb" color="green" variant="subtle">AWB {{ awb }}</UBadge>
        </div>
      </template>

      <!-- No shipment yet → create -->
      <div v-if="!awb" class="space-y-4">
        <UFormGroup label="Pickup Location">
          <USelect v-model="createForm.pickupLocation" :options="locationOptions" placeholder="Register a pickup location first" />
        </UFormGroup>
        <div class="grid grid-cols-4 gap-2">
          <UFormGroup label="Weight (kg)"><UInput v-model.number="createForm.weight" type="number" step="0.1" /></UFormGroup>
          <UFormGroup label="L (cm)"><UInput v-model.number="createForm.length" type="number" /></UFormGroup>
          <UFormGroup label="W (cm)"><UInput v-model.number="createForm.width" type="number" /></UFormGroup>
          <UFormGroup label="H (cm)"><UInput v-model.number="createForm.height" type="number" /></UFormGroup>
        </div>
        <div class="flex items-center gap-2">
          <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-map-pin" :loading="busy === 'service'" @click="checkServiceability">
            Check serviceability
          </UButton>
          <span class="text-xs text-gray-500">{{ serviceMsg }}</span>
        </div>
        <UButton block icon="i-heroicons-truck" :loading="busy === 'create'" :disabled="!createForm.pickupLocation" @click="createShipment">
          Create Shipment
        </UButton>
      </div>

      <!-- Shipment exists → operations -->
      <div v-else class="space-y-5">
        <div class="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-sm">
          <p>Status: <span class="font-medium">{{ shipping?.status || order?.status }}</span></p>
          <p v-if="shipping?.labelUrl" class="text-xs text-primary-500 truncate">Label ready</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton size="sm" icon="i-heroicons-document-text" :loading="busy === 'label'" @click="generateLabel">Generate Label</UButton>
          <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-magnifying-glass" :loading="busy === 'track'" @click="track">Track</UButton>
          <UButton size="sm" color="red" variant="soft" icon="i-heroicons-x-circle" :loading="busy === 'cancel'" @click="cancel">Cancel</UButton>
        </div>

        <div v-if="trackInfo" class="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
          <p class="font-medium">Live status: {{ trackInfo.status || '—' }}</p>
        </div>

        <UDivider label="NDR (failed delivery)" />
        <div class="grid grid-cols-2 gap-2">
          <UFormGroup label="Action"><USelect v-model="ndrForm.action" :options="ndrActions" /></UFormGroup>
          <UFormGroup label="Remarks"><UInput v-model="ndrForm.remarks" /></UFormGroup>
        </div>
        <UButton size="sm" color="orange" variant="soft" icon="i-heroicons-arrow-path" :loading="busy === 'ndr'" @click="ndrAct">
          Submit NDR Action
        </UButton>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" color="gray" @click="open = false">Close</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
