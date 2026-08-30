<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; order: any }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; updated: [] }>();

const toast = useToast();
const { cancelShipment: cancelShipmentRequest } = useShipmentActions();

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
    toast.add({ title: 'Could not load shipment preview', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally {
    previewLoading.value = false;
  }
}

// Load the preview when the modal opens for an unshipped order.
watch(() => [open.value, awb.value], ([isOpen, hasAwb]) => {
  if (isOpen && !hasAwb) loadPreview();
}, { immediate: true });

// What actually goes to the carrier as the consignee — the order's shipping
// address, falling back to the client record the same way the server does.
const consignee = computed(() => {
  const a = props.order?.shippingAddress || {};
  const client = props.order?.client || {};
  const name = `${a.firstName || ''} ${a.lastName || ''}`.trim() || client.name || '';
  const street = a.formattedAddress
    || [a.houseDetails, a.street, a.locality, a.landmark].filter(Boolean).join(', ');
  return {
    name,
    phone: a.phoneNo || a.phone || client.phone || '',
    street,
    region: [a.city, a.state, a.pincode].filter(Boolean).join(', '),
    country: a.country || 'India',
    pincode: a.pincode || '',
    type: a.type || '',
  };
});

async function checkServiceability() {
  busy.value = 'service';
  serviceMsg.value = '';
  try {
    const pincode = consignee.value.pincode;
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
  // Catch the obvious gaps here so the seller gets a precise reason instead of
  // the carrier's generic rejection.
  const missing: string[] = [];
  if (!consignee.value.name) missing.push('consignee name');
  if (!consignee.value.phone) missing.push('phone number');
  if (!consignee.value.pincode) missing.push('delivery pincode');
  if (!previewMeta.value?.pickupLocation) missing.push('a registered pickup location');
  if (missing.length) {
    toast.add({
      title: 'Cannot create shipment',
      description: `Missing ${missing.join(', ')}.`,
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
      timeout: 8000,
    });
    return;
  }

  busy.value = 'create';
  try {
    const r: any = await $fetch('/api/ecommerce-cms/shipping/order-create', {
      method: 'POST', body: { orderId: props.order.id },
    });
    // No print prompt here — the row's actions menu carries Print label and
    // Download PDF, so the toast is the only feedback needed.
    toast.add({
      title: `Shipment created · AWB ${r.awb}`,
      description: r.boxCount > 1 ? `${r.boxCount} boxes · ${r.totalWeight} kg` : undefined,
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 6000,
    });
    emit('updated');
    open.value = false;
  } catch (e: any) {
    // Carrier rejections are worth reading — don't auto-dismiss them.
    toast.add({
      title: 'Could not create shipment',
      description: carrierError(e),
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    busy.value = '';
  }
}

const dims = (l: any) => [l.length, l.width, l.height].every((v: any) => v != null)
  ? `${l.length}×${l.width}×${l.height}` : '—';

// Labels are shared with the orders table - see composables/useShippingLabels.ts.
const { downloadCarrierPdf, printLabels, downloadLabels } = useShippingLabels();

const printLabel = () => printLabels([awb.value]);
const downloadLabel = () => downloadLabels(
  [awb.value],
  `label-order-${props.order?.orderNumber ?? ''}-${awb.value}.pdf`,
);

async function track() {
  busy.value = 'track';
  try {
    trackInfo.value = await $fetch('/api/ecommerce-cms/shipping/track', { query: { trackingId: awb.value } });
  } catch (e: any) {
    toast.add({ title: 'Track failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally {
    busy.value = '';
  }
}

async function cancel() {
  busy.value = 'cancel';
  try {
    if (await cancelShipmentRequest(awb.value, props.order.id)) {
      emit('updated');
      open.value = false;
    }
  } finally {
    busy.value = '';
  }
}

// ---- E-way bill ----
// Legally required over ₹50,000. The number comes from the government GST
// portal — we cannot generate it, only record it and pass it to the carrier.
const ewaybillInput = ref('');
const ewaybillSaved = computed(() => previewMeta.value?.order?.ewaybill || shipping.value?.ewbn || '');
const ewaybillRequired = computed(() => Boolean(previewMeta.value?.order?.ewaybillRequired)
  || Number(props.order?.grandTotal || 0) > 50000);

watch(() => ewaybillSaved.value, (v) => { if (v) ewaybillInput.value = v; }, { immediate: true });

async function saveEwaybill() {
  const ewbn = ewaybillInput.value.trim();
  if (!ewbn) return;
  busy.value = 'ewaybill';
  try {
    const r: any = await $fetch('/api/ecommerce-cms/shipping/ewaybill', {
      method: 'POST', body: { orderId: props.order.id, ewbn },
    });
    toast.add({
      title: 'E-way bill saved',
      description: r.pushedToCarrier
        ? `Sent to the carrier against AWB ${r.awb}`
        : 'Will be sent with the shipment when you create it',
      color: 'green',
    });
    emit('updated');
    if (!awb.value) await loadPreview();
  } catch (e: any) {
    toast.add({
      title: 'Could not save the e-way bill',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
    });
  } finally {
    busy.value = '';
  }
}

// ---- Edit shipment ----
// Only the fields Delhivery's edit API accepts. Pincode is NOT among them — a
// wrong pincode needs a cancel + recreate, which the Cancel button now enables.
const editOpen = ref(false);
const editForm = ref<Record<string, any>>({
  name: '', phone: '', address: '', productsDesc: '',
  weight: null, length: null, width: null, height: null,
  paymentMode: '', codAmount: null,
});
const paymentModes = ['', 'COD', 'Pre-paid'];

function startEdit() {
  const a = props.order?.shippingAddress || {};
  editForm.value = {
    name: consignee.value.name,
    phone: consignee.value.phone,
    address: consignee.value.street,
    productsDesc: (Array.isArray(props.order?.items) ? props.order.items : [])
      .map((i: any) => i.name || i.variantName).filter(Boolean).join(', ').slice(0, 200),
    weight: shipping.value?.totalWeight ?? null,
    length: null, width: null, height: null,
    paymentMode: '', codAmount: null,
  };
  editOpen.value = true;
}

async function saveEdit() {
  busy.value = 'edit';
  try {
    // Send only what was filled in; the carrier leaves untouched fields alone.
    const body: Record<string, any> = { awb: awb.value };
    for (const [k, v] of Object.entries(editForm.value)) {
      if (v !== '' && v !== null && v !== undefined) body[k] = v;
    }
    await $fetch('/api/ecommerce-cms/shipping/update', { method: 'POST', body });
    toast.add({ title: 'Shipment updated', color: 'green' });
    editOpen.value = false;
    emit('updated');
  } catch (e: any) {
    toast.add({
      title: 'Could not update shipment',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
    });
  } finally {
    busy.value = '';
  }
}

// Pickup is a batch action on the Pickup Locations page, not per-order.

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

          <!-- Deliver to: exactly what is sent to the carrier as the consignee -->
          <div class="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div class="mb-1 flex items-center justify-between">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-400">Deliver to</p>
              <UBadge v-if="consignee.type" size="xs" variant="subtle" color="gray">{{ consignee.type }}</UBadge>
            </div>
            <p class="font-medium text-gray-900 dark:text-white">
              {{ consignee.name || '— no consignee name' }}
            </p>
            <p class="text-gray-500">{{ consignee.phone || '— no phone' }}</p>
            <p class="mt-1 text-gray-600 dark:text-gray-300">
              {{ consignee.street || '— no address saved' }}
            </p>
            <p class="text-gray-600 dark:text-gray-300">
              {{ [consignee.region, consignee.country].filter(Boolean).join(' · ') }}
            </p>
            <p v-if="!consignee.pincode" class="mt-1 text-xs text-red-500">
              No pincode — the carrier will reject this shipment.
            </p>
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


          <!-- E-way bill: legally required over ₹50,000. Shown before the
               shipment is created so the number travels with the manifest. -->
          <div
            v-if="ewaybillRequired"
            class="rounded-lg border p-3"
            :class="ewaybillSaved
              ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
              : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'"
          >
            <div class="flex items-start gap-2">
              <UIcon
                :name="ewaybillSaved ? 'i-heroicons-check-circle' : 'i-heroicons-exclamation-triangle'"
                class="mt-0.5 shrink-0"
                :class="ewaybillSaved ? 'text-green-600' : 'text-red-600'"
              />
              <div class="w-full">
                <p class="text-sm font-medium" :class="ewaybillSaved ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'">
                  E-way bill {{ ewaybillSaved ? 'recorded' : 'required' }}
                </p>
                <p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                  This order is over ₹50,000, so Indian law requires an e-way bill.
                  Generate it on the GST portal and enter the number here.
                </p>
                <div class="mt-2 flex gap-2">
                  <UInput v-model="ewaybillInput" placeholder="E-way bill number" size="sm" class="flex-1" />
                  <UButton
                    size="sm"
                    :loading="busy === 'ewaybill'"
                    :disabled="!ewaybillInput.trim()"
                    @click="saveEwaybill"
                  >
                    Save
                  </UButton>
                </div>
              </div>
            </div>
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

      <!-- Shipment exists → operations, or the edit form on its own. Editing
           hides everything else: it is a form to fill in, and Print / Track /
           Cancel next to it invited a mis-click mid-edit. -->
      <div v-else-if="!editOpen" class="space-y-5">
        <div class="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-sm">
          <p>Status: <span class="font-medium">{{ shipping?.status || order?.status }}</span></p>
          <p v-if="shipping?.labelUrl" class="text-xs text-primary-500 truncate">Label ready</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton size="sm" icon="i-heroicons-printer" @click="printLabel">Print Label</UButton>
          <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-arrow-down-tray" @click="downloadLabel">Download PDF</UButton>
          <UButton
            size="sm"
            color="gray"
            variant="ghost"
            icon="i-heroicons-document-text"
            title="Delhivery's own PDF, unmodified"
            @click="downloadCarrierPdf(awb)"
          >
            Carrier PDF
          </UButton>
          <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-magnifying-glass" :loading="busy === 'track'" @click="track">Track</UButton>
          <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-pencil-square" @click="startEdit">Edit</UButton>
          <UButton size="sm" color="red" variant="soft" icon="i-heroicons-x-circle" :loading="busy === 'cancel'" @click="cancel">Cancel</UButton>
        </div>

        <div v-if="trackInfo" class="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
          <p class="font-medium">Live status: {{ trackInfo.status || '—' }}</p>
        </div>

        <!-- Attach or correct the e-way bill after the shipment exists -->
        <div v-if="ewaybillRequired" class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p class="mb-2 text-sm font-medium text-gray-900 dark:text-white">
            E-way bill
            <UBadge v-if="ewaybillSaved" color="green" variant="subtle" size="xs" class="ml-1">recorded</UBadge>
            <UBadge v-else color="red" variant="subtle" size="xs" class="ml-1">missing</UBadge>
          </p>
          <div class="flex gap-2">
            <UInput v-model="ewaybillInput" placeholder="E-way bill number" size="sm" class="flex-1" />
            <UButton size="sm" :loading="busy === 'ewaybill'" :disabled="!ewaybillInput.trim()" @click="saveEwaybill">
              Update
            </UButton>
          </div>
          <p class="mt-1 text-xs text-gray-500">Sent to Delhivery against AWB {{ awb }}.</p>
        </div>

      </div>

      <!-- Edit shipment: only the fields the carrier actually accepts, and
           nothing else on screen while they are being filled in. -->
      <div v-else class="space-y-4">
        <div>
          <p class="text-sm font-medium text-gray-900 dark:text-white">Edit shipment details</p>
          <p class="mb-3 text-xs text-gray-500">AWB {{ awb }}</p>

          <div class="grid grid-cols-2 gap-2">
            <UFormGroup label="Consignee name"><UInput v-model="editForm.name" /></UFormGroup>
            <UFormGroup label="Phone"><UInput v-model="editForm.phone" /></UFormGroup>
            <UFormGroup label="Address" class="col-span-2"><UTextarea v-model="editForm.address" :rows="2" /></UFormGroup>
            <UFormGroup label="Product description" class="col-span-2">
              <UInput v-model="editForm.productsDesc" maxlength="200" />
            </UFormGroup>
            <UFormGroup label="Weight (kg)"><UInput v-model.number="editForm.weight" type="number" step="0.01" /></UFormGroup>
            <UFormGroup label="Payment mode" help="Only COD ↔ Prepaid switches are allowed">
              <USelect v-model="editForm.paymentMode" :options="paymentModes" />
            </UFormGroup>
            <UFormGroup v-if="editForm.paymentMode === 'COD'" label="COD amount" class="col-span-2">
              <UInput v-model.number="editForm.codAmount" type="number" />
            </UFormGroup>
            <UFormGroup label="Length (cm)"><UInput v-model.number="editForm.length" type="number" step="0.1" /></UFormGroup>
            <UFormGroup label="Width (cm)"><UInput v-model.number="editForm.width" type="number" step="0.1" /></UFormGroup>
            <UFormGroup label="Height (cm)"><UInput v-model.number="editForm.height" type="number" step="0.1" /></UFormGroup>
          </div>

          <p class="mt-2 text-xs text-gray-500">
            Pincode cannot be edited — the carrier ignores it. To change the pincode, cancel this
            shipment and create a new one.
          </p>

          <div class="mt-4 flex justify-end gap-2">
            <UButton size="sm" color="gray" variant="ghost" @click="editOpen = false">Discard</UButton>
            <UButton size="sm" :loading="busy === 'edit'" icon="i-heroicons-check" @click="saveEdit">
              Save changes
            </UButton>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" color="gray" @click="open = false">Close</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
