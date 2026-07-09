<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; order: any }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; updated: [] }>();

const toast = useToast();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const shipping = computed(() => props.order?.meta?.shipping || null);
const awb = computed(() => shipping.value?.awb || null);

const busy = ref('');
const serviceMsg = ref('');
const trackInfo = ref<any>(null);

// ---- Auto shipment preview (same resolution + cartonization as bulk) ----
const preview = ref<any>(null);          // the single-order preview object
const previewMeta = ref<any>(null);      // pickupLocation / boxesConfigured
const previewLoading = ref(false);

async function loadPreview() {
  if (!props.order?.id) return;
  previewLoading.value = true;
  preview.value = null;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/order-preview', {
      query: { orderId: props.order.id },
    });
    previewMeta.value = res;
    preview.value = res.order || null;
  } catch (e: any) {
    toast.add({ title: 'Could not load shipment preview', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    previewLoading.value = false;
  }
}

// Load the preview when the modal opens for an unshipped order.
watch(() => [open.value, awb.value], ([isOpen, hasAwb]) => {
  if (isOpen && !hasAwb) loadPreview();
}, { immediate: true });

function addressParts() {
  const a = props.order?.shippingAddress || {};
  return { pincode: a.pincode || '' };
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

// Create the shipment (SPS/MPS + label) for this one order.
async function createShipment() {
  busy.value = 'create';
  try {
    const r: any = await $fetch('/api/ecommerce-cms/shipping/order-create', {
      method: 'POST', body: { orderId: props.order.id },
    });
    toast.add({ title: `Shipment created · AWB ${r.awb || '—'}`, color: 'green' });
    if (r.labelUrl && window.confirm('Shipment created. Print the label now?')) window.open(r.labelUrl, '_blank');
    emit('updated');
    open.value = false;
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = '';
  }
}

const dims = (l: any) => [l.length, l.width, l.height].every((v: any) => v != null)
  ? `${l.length}×${l.width}×${l.height}` : '—';

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

      <!-- No shipment yet → auto-resolved preview + create -->
      <div v-if="!awb" class="space-y-4">
        <div v-if="previewLoading" class="flex items-center justify-center py-8 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
        </div>

        <template v-else-if="preview">
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span class="text-gray-500">Pickup: {{ previewMeta?.pickupLocation || '— none registered' }}</span>
            <span class="text-gray-500">{{ previewMeta?.boxesConfigured }} box preset(s)</span>
          </div>

          <!-- Resolved dimensions per item (item → product) -->
          <div class="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-900 text-left text-xs uppercase text-gray-400">
                <tr><th class="p-2">Item</th><th>Qty</th><th>Weight</th><th>Dims (cm)</th><th>From</th></tr>
              </thead>
              <tbody>
                <tr v-for="(l, i) in preview.lines" :key="i" class="border-t border-gray-100 dark:border-gray-800">
                  <td class="p-2">{{ l.name }}</td>
                  <td>{{ l.qty }}</td>
                  <td>
                    <span v-if="l.resolved">{{ l.weight }} kg</span>
                    <span v-else class="text-red-500">missing</span>
                  </td>
                  <td>{{ dims(l) }}</td>
                  <td>
                    <UBadge v-if="l.source" size="xs" variant="subtle" :color="l.source === 'item' ? 'blue' : 'gray'">{{ l.source }}</UBadge>
                    <span v-else class="text-xs text-red-500">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Chosen boxes + total weight -->
          <div class="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-sm space-y-1">
            <p>
              Boxes:
              <span v-if="preview.canShip" class="font-medium">
                {{ preview.boxCount ? `${preview.boxCount} — ${preview.boxes.join(', ')}` : 'single package (no box)' }}
              </span>
              <span v-else>—</span>
            </p>
            <p v-if="preview.canShip">Total shipment weight: <span class="font-medium">{{ preview.totalWeight }} kg</span></p>
          </div>

          <div v-if="!preview.canShip" class="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600">
            <UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5" />
            <span>Not able to generate shipment — {{ preview.reason || 'missing weight/dimensions' }}</span>
          </div>

          <div class="flex items-center gap-2">
            <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-map-pin" :loading="busy === 'service'" @click="checkServiceability">
              Check serviceability
            </UButton>
            <span class="text-xs text-gray-500">{{ serviceMsg }}</span>
          </div>

          <UButton block icon="i-heroicons-truck" :loading="busy === 'create'" :disabled="!preview.canShip" @click="createShipment">
            Create Shipment
          </UButton>
        </template>

        <div v-else class="py-6 text-center text-sm text-gray-500">Could not load preview.</div>
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
