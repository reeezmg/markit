<script setup lang="ts">
import { format } from 'date-fns';
import { useFindManyEcommPickupLocation, useCreateEcommPickupLocation, useUpdateEcommPickupLocation, useUpdateManyEcommPickupLocation, useDeleteEcommPickupLocation } from '~/lib/hooks/ecomm-pickup-location';

definePageMeta({ auth: true });

const auth = useNuxtApp().$auth;
const useAuth = () => auth;
const toast = useToast();
const { printLabels, downloadLabels } = useShippingLabels();
const companyId = computed(() => useAuth().session.value?.companyId || '');

// ─── Pickup locations (warehouses) ──────────────────────────────────────────
const locationRead = useFindManyEcommPickupLocation(
  computed(() => ({
    where: { companyId: companyId.value },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })),
  { enabled: computed(() => Boolean(companyId.value)) },
);
const { data: locations, isLoading, refetch } = locationRead;
onServerPrefetch(async () => { if (companyId.value) await locationRead.suspense().catch(() => {}); });


const { mutate: createLocation, isPending: isCreating } = useCreateEcommPickupLocation();
const { mutate: updateLocation, isPending: isUpdating } = useUpdateEcommPickupLocation();
const { mutate: updateManyLocations } = useUpdateManyEcommPickupLocation();
const { mutate: deleteLocation } = useDeleteEcommPickupLocation();

const blank = () => ({
  id: '', name: '', contactName: '', phone: '', email: '',
  address: '', city: '', state: '', pincode: '', country: 'India',
  returnAddress: '', returnPincode: '', returnCity: '', returnState: '', returnCountry: 'India',
  isDefault: false,
});

const modalOpen = ref(false);
const form = ref(blank());
const editing = computed(() => Boolean(form.value.id));
const registeringId = ref<string | null>(null);

const fields: Array<{ key: keyof ReturnType<typeof blank>; label: string; required?: boolean; half?: boolean }> = [
  { key: 'name',        label: 'Location Name', required: true },
  { key: 'contactName', label: 'Contact Name', half: true },
  { key: 'phone',       label: 'Phone', required: true, half: true },
  { key: 'email',       label: 'Email', half: true },
  { key: 'pincode',     label: 'Pincode', required: true, half: true },
  { key: 'address',     label: 'Address', required: true },
  { key: 'city',        label: 'City', half: true },
  { key: 'state',       label: 'State', half: true },
];

// A warehouse already registered with the carrier cannot be renamed.
const nameLocked = computed(() => Boolean(form.value.id && (form.value as any).registeredWithCarrier));

const isValid = computed(() =>
  fields.filter((f) => f.required).every((f) => String(form.value[f.key] || '').trim() !== ''),
);

function openCreate() { form.value = blank(); modalOpen.value = true; }
function openEdit(loc: any) { form.value = { ...blank(), ...loc }; modalOpen.value = true; }

function save() {
  if (!isValid.value) return;
  const { id, ...rest } = form.value;
  // Delhivery matches the warehouse name exactly — a stray leading/trailing
  // space makes every shipment fail with "ClientWarehouse matching query does
  // not exist", so never store an untrimmed name.
  const data = { ...rest, name: rest.name.trim() };
  const payload = { ...data, companyId: companyId.value, carrier: 'delhivery' };
  // After the local row is saved, push it straight to Delhivery (create on add,
  // edit on update) so the warehouse always mirrors what's in storetools.
  const onDone = async (savedId: string, msg: string) => {
    modalOpen.value = false;
    toast.add({ title: msg, color: 'green' });
    await syncToCarrier(savedId, data.name);
  };
  if (id) {
    updateLocation({ where: { id }, data },
      { onSuccess: () => onDone(id, 'Location updated'), onError: (e: any) => toast.add({ title: 'Update failed', description: e.message, color: 'red' }) });
  } else {
    createLocation({ data: payload },
      { onSuccess: (created: any) => onDone(created?.id, 'Location added'), onError: (e: any) => toast.add({ title: 'Create failed', description: e.message, color: 'red' }) });
  }
}

function setDefault(loc: any) {
  updateManyLocations(
    { where: { companyId: companyId.value, isDefault: true }, data: { isDefault: false } },
    { onSuccess: () => updateLocation({ where: { id: loc.id }, data: { isDefault: true } },
      { onSuccess: () => { toast.add({ title: `${loc.name} set as default`, color: 'green' }); refetch(); } }) },
  );
}

function remove(loc: any) {
  // Deleting is local-only and has consequences the seller cannot see: shipment
  // creation resolves its pickup location from this table, so removing the last
  // (or default) one silently stops every new shipment.
  const openPickups = requests.value.filter(
    (r: any) => r.location === loc.name && r.status === 'REQUESTED').length;
  const warnings = [
    loc.isDefault ? '• This is the DEFAULT pickup location.' : '',
    (locations.value || []).length <= 1 ? '• It is your ONLY pickup location — new shipments will fail without one.' : '',
    openPickups ? `• ${openPickups} open pickup request(s) reference it.` : '',
  ].filter(Boolean);
  if (!window.confirm(
    `Remove "${loc.name}" from storetools?\n\n`
    + (warnings.length ? warnings.join('\n') + '\n\n' : '')
    + 'Delhivery has no delete API, so the warehouse stays registered on their side '
    + 'and must be removed from their portal manually.')) return;

  deleteLocation({ where: { id: loc.id } },
    { onSuccess: () => {
        // Delhivery exposes no warehouse-delete API, so this only removes the
        // local record — the warehouse still exists on Delhivery's side.
        toast.add({
          title: `${loc.name} removed from storetools`,
          description: 'Delhivery has no delete API — this warehouse still exists on Delhivery and must be removed from their portal manually.',
          icon: 'i-heroicons-exclamation-triangle',
          color: 'amber',
          timeout: 8000,
        });
        refetch();
      },
      onError: (e: any) => toast.add({ title: 'Delete failed', description: e.message, color: 'red' }) });
}

// Push a location to the carrier. The register endpoint creates the warehouse on
// Delhivery if it isn't registered yet, or edits it if it already is — so this is
// safe to call after both create and edit.
async function syncToCarrier(id: string, name: string) {
  if (!id) return;
  registeringId.value = id;
  try {
    await $fetch(`/api/ecommerce-cms/shipping/pickup-locations/${id}/register`, { method: 'POST' });
    toast.add({ title: `${name} synced with Delhivery`, color: 'green' });
  } catch (e: any) {
    toast.add({
      title: 'Delhivery sync failed',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    registeringId.value = null;
    refetch();
  }
}

function registerWithCarrier(loc: any) {
  return syncToCarrier(loc.id, loc.name);
}

// ─── Raise pickup request ───────────────────────────────────────────────────
const pickupProviders = ref<any[]>([]);
const providerError = ref('');
const loadingProviders = ref(true);
const raising = ref(false);
const remainingCount = ref(0);
const today = new Date().toISOString().slice(0, 10);
const pickupForm = ref({ location: '', date: today, time: '12:00:00', carriers: [] as string[] });

const locationOptions = computed(() =>
  (locations.value || []).map((l: any) => ({ label: l.isDefault ? `${l.name} (default)` : l.name, value: l.name })),
);

watchEffect(() => {
  if (!pickupForm.value.location && locationOptions.value.length) {
    pickupForm.value.location = (locations.value || []).find((l: any) => l.isDefault)?.name || locationOptions.value[0].value;
  }
});

// How many remaining orders would be auto-attached (sum across chosen carriers).
async function refreshRemaining() {
  const { location, carriers } = pickupForm.value;
  if (!location || !carriers.length) { remainingCount.value = 0; return; }
  let total = 0;
  for (const carrier of carriers) {
    try {
      const r: any = await $fetch('/api/ecommerce-cms/pickup/remaining', { query: { location, carrier } });
      total += r.count || 0;
    } catch { /* ignore */ }
  }
  remainingCount.value = total;
}
watch(() => [pickupForm.value.location, pickupForm.value.carriers], refreshRemaining, { deep: true });

// ─── Confirm which parcels go on the pickup ─────────────────────────────────
// Handing a parcel over is a physical act — the seller must see exactly which
// ones the driver is expected to take, and be able to hold one back (still on
// the bench, damaged box, anything). Everything starts ticked.
//
// A row is a shipment, not an order: an exchange (REPL) replacement leaves the
// warehouse just like a forward parcel, so it is listed and counted separately
// with its own id ("<orderId>:<kind>").
const confirmOpen = ref(false);
const pendingLoading = ref(false);
const pendingOrders = ref<any[]>([]);
const pendingSelected = ref<string[]>([]);

const allPendingSelected = computed({
  get: () => pendingOrders.value.length > 0 && pendingSelected.value.length === pendingOrders.value.length,
  set: (on: boolean) => { pendingSelected.value = on ? pendingOrders.value.map((o) => o.id) : []; },
});

async function openConfirm() {
  const { location, date, carriers } = pickupForm.value;
  if (!location || !date || !carriers.length) return;
  confirmOpen.value = true;
  pendingLoading.value = true;
  pendingOrders.value = [];
  pendingSelected.value = [];
  try {
    const all: any[] = [];
    for (const carrier of carriers) {
      const r: any = await $fetch('/api/ecommerce-cms/pickup/pending', { query: { location, carrier } });
      all.push(...(r.orders || []).map((o: any) => ({ ...o, carrier })));
    }
    pendingOrders.value = all;
    // Everything is ticked except parcels the seller held back from the orders
    // screen — that decision is stored on the order, so it survives reloads.
    pendingSelected.value = all.filter((o: any) => !o.excluded).map((o: any) => o.id);
  } catch (e: any) {
    toast.add({ title: 'Could not load parcels', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
    confirmOpen.value = false;
  } finally {
    pendingLoading.value = false;
  }
}

async function raisePickup() {
  const { location, date, time, carriers } = pickupForm.value;
  if (!location || !date || !carriers.length) return;
  if (!pendingSelected.value.length) return;
  raising.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/pickup/raise', {
      method: 'POST',
      body: { location, date, time, carriers, shipmentIds: pendingSelected.value },
    });
    confirmOpen.value = false;
    const ok = (res.results || []).filter((r: any) => r.ok);
    const failed = (res.results || []).filter((r: any) => !r.ok);
    if (ok.length) toast.add({ title: `Pickup raised: ${ok.map((r: any) => `${r.carrier} (${r.orders} orders)`).join(', ')}`, color: 'green' });
    if (failed.length) {
      toast.add({
        title: `Pickup failed: ${failed.map((r: any) => r.carrier).join(', ')}`,
        // One line per carrier: raising two carriers can fail for two different
        // reasons, and only naming them tells the seller which to fix.
        description: failed.map((r: any) => `${r.carrier}: ${carrierMessage(r.error)}`).join('\n'),
        color: 'red',
        timeout: 0,
        ui: { description: 'whitespace-pre-line' },
      });
    }
    await Promise.all([loadRequests(), refreshRemaining()]);
  } catch (e: any) {
    toast.add({
      title: 'Raise pickup failed',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally { raising.value = false; }
}

// ─── Pickup requests table ──────────────────────────────────────────────────
const requests = ref<any[]>([]);
const loadingRequests = ref(false);
const requestDetailsOpen = ref(false);
const selectedRequest = ref<any | null>(null);
const addOrdersOpen = ref(false);
const addOrdersPickup = ref<any | null>(null);
const carrierScheduleOpen = ref(false);
const carrierSchedulePickup = ref<any | null>(null);
const statusColor = (s: string) => (s === 'PICKED' ? 'green' : s === 'CANCELLED' ? 'red' : 'amber');

function requestReference(req: any, index: number) {
  return req.carrierPickupId || `Request ${requests.value.length - index}`;
}

function pickupSchedule(req: any) {
  const schedule = req.carrierSchedule;
  if (!schedule?.date) return 'Carrier slot not recorded';
  return `${schedule.date} · ${schedule.startTime}–${schedule.endTime} IST`;
}

function requestedSchedule(req: any) {
  const rawDate = String(req.requestedPickupDate || req.pickupDate || '').slice(0, 10);
  if (!rawDate) return '—';

  try {
    const date = new Date(`${rawDate}T00:00:00`);
    return `${format(date, 'dd MMM yyyy')} at ${req.requestedPickupTime || req.pickupTime || '—'}`;
  } catch {
    return `${rawDate} at ${req.requestedPickupTime || req.pickupTime || '—'}`;
  }
}

function createdOn(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : format(date, 'dd MMM yyyy, hh:mm a');
}

function openRequest(req: any) {
  selectedRequest.value = req;
  requestDetailsOpen.value = true;
}

function productAmount(product: any) {
  const stored = Number(product.value || 0);
  return stored || Number(product.rate || 0) * Number(product.quantity || 0);
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
}

async function loadRequests() {
  loadingRequests.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/pickup/requests');
    requests.value = res.requests || [];
    if (selectedRequest.value) {
      selectedRequest.value = requests.value.find((request: any) => request.id === selectedRequest.value.id) || null;
      if (!selectedRequest.value) requestDetailsOpen.value = false;
    }
  } catch (e: any) {
    toast.add({ title: 'Could not load pickup requests', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally { loadingRequests.value = false; }
}

async function updateStatus(req: any, status: string) {
  if (status === req.status) return;
  try {
    await $fetch('/api/ecommerce-cms/pickup/status', { method: 'POST', body: { id: req.id, status } });
    toast.add({ title: `Pickup marked ${status}`, color: 'green' });
    loadRequests();
  } catch (e: any) {
    toast.add({ title: 'Status update failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  }
}

function pickupAwbs(req: any) {
  return [...new Set((req?.shipments || []).map((shipment: any) => String(shipment.awb || '').trim()).filter(Boolean))] as string[];
}

function printPickupLabels(req: any) {
  printLabels(pickupAwbs(req));
}

function downloadPickupLabels(req: any) {
  const reference = req.carrierPickupId || req.id;
  downloadLabels(pickupAwbs(req), `pickup-${reference}-labels.pdf`);
}

async function cancelPickup(req: any) {
  if (req.carrierPickupId) {
    window.open('https://one.delhivery.com/v2/pickup-requests/domestic', '_blank', 'noopener,noreferrer');
    toast.add({
      title: 'Cancel this pickup in Delhivery One',
      description: 'Carrier-backed pickups cannot be cancelled safely from Markit. The Delhivery pickup page has been opened.',
      color: 'orange',
      timeout: 8000,
    });
    return;
  }

  if (!window.confirm('This request was not created in Delhivery. Cancel it in Markit and release its parcels?')) return;
  await updateStatus(req, 'CANCELLED');
}

function requestActions(req: any) {
  const actions: any[] = [
    { label: 'Print labels', icon: 'i-heroicons-printer-20-solid', click: () => printPickupLabels(req) },
    { label: 'Download labels', icon: 'i-heroicons-arrow-down-tray-20-solid', click: () => downloadPickupLabels(req) },
  ];
  if (req.status !== 'CANCELLED' && req.status !== 'PICKED') {
    if (req.carrierPickupId) {
      actions.push(
        { label: 'Add orders', icon: 'i-heroicons-plus-20-solid', click: () => { addOrdersPickup.value = req; addOrdersOpen.value = true; } },
        { label: 'Record carrier slot', icon: 'i-heroicons-calendar-20-solid', click: () => { carrierSchedulePickup.value = req; carrierScheduleOpen.value = true; } },
      );
    }
    actions.push({
      label: req.carrierPickupId ? 'Cancel in Delhivery' : 'Cancel pickup',
      icon: 'i-heroicons-x-circle-20-solid',
      click: () => cancelPickup(req),
    });
  }
  return actions;
}

async function loadProviders() {
  loadingProviders.value = true;
  providerError.value = '';
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/providers');
    pickupProviders.value = (res.providers || []).filter((p: any) => p.supportsPickup);
  } catch (error: any) {
    providerError.value = carrierError(error);
  }
  finally { loadingProviders.value = false; }
}

// Fire both fetches in parallel and don't block one card behind the other.
onMounted(() => {
  loadRequests();
  loadProviders();
});
</script>

<template>
  <UDashboardPanelContent class="pb-24">
  <div class="p-6 space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Pickup</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Raise carrier pickups for your shipped orders and track each request. Manage pickup locations below.
        </p>
      </div>
      <UButton icon="i-heroicons-plus" color="gray" variant="soft" @click="openCreate">Add Location</UButton>
    </div>

    <UAlert v-if="providerError" color="red" title="Couldn’t load shipping carriers" :description="providerError">
      <template #actions><UButton color="red" variant="soft" @click="loadProviders">Retry</UButton></template>
    </UAlert>
    <UAlert
      v-else-if="!loadingProviders && !pickupProviders.length"
      icon="i-heroicons-truck"
      title="Connect a shipping carrier to raise pickups"
      description="You can manage pickup locations below while you set up a carrier."
    />

    <!-- Raise pickup -->
    <UCard v-if="loadingProviders || pickupProviders.length">
      <template #header>
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Raise Pickup Request</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            One request collects all remaining shipped orders for a location from the chosen carrier(s).
          </p>
        </div>
      </template>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UFormGroup label="Location">
          <USelect v-model="pickupForm.location" :options="locationOptions" />
        </UFormGroup>
        <UFormGroup label="Date">
          <UInput v-model="pickupForm.date" type="date" />
        </UFormGroup>
        <UFormGroup label="Time">
          <UInput v-model="pickupForm.time" />
        </UFormGroup>
        <UFormGroup label="Carriers">
          <USelectMenu
            v-model="pickupForm.carriers"
            :options="pickupProviders.map((p) => ({ label: p.label, value: p.id }))"
            value-attribute="value"
            option-attribute="label"
            multiple
            :loading="loadingProviders"
            :placeholder="loadingProviders ? 'Loading carriers…' : 'Select carriers'"
          />
        </UFormGroup>
      </div>
      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs text-gray-500">
          <UIcon name="i-heroicons-cube" class="align-text-bottom" />
          {{ remainingCount }} parcel{{ remainingCount === 1 ? '' : 's' }} awaiting pickup — you can choose which to hand over.
        </p>
        <UButton
          icon="i-heroicons-truck"
          :disabled="!pickupForm.carriers.length || !pickupForm.location || !pickupForm.date"
          @click="openConfirm"
        >
          Raise Pickup
        </UButton>
      </div>
    </UCard>

    <!-- Which parcels go on this pickup -->
    <UModal v-model="confirmOpen" :ui="{ width: 'sm:max-w-3xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Parcels for this pickup</h2>
              <p class="text-xs text-gray-500">
                {{ pickupForm.location }} · {{ pickupForm.date }} at {{ pickupForm.time }}
              </p>
            </div>
            <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="confirmOpen = false" />
          </div>
        </template>

        <div v-if="pendingLoading" class="flex items-center justify-center py-12 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
        </div>

        <div v-else-if="!pendingOrders.length" class="py-10 text-center text-sm text-gray-500">
          No parcels are awaiting pickup at this location.
          <p class="mt-1 text-xs">Create a shipment first — a parcel appears here once it has a waybill.</p>
        </div>

        <div v-else class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            <strong>{{ pendingSelected.length }}</strong> of {{ pendingOrders.length }} selected.
            Untick anything you are not handing over — it stays available for a later pickup.
            <span v-if="pendingOrders.some((o) => o.excluded)">
              Parcels marked <em>held back</em> were excluded from the orders screen; tick one to include it anyway.
            </span>
          </p>

          <div class="max-h-96 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-400 dark:bg-gray-900">
                <tr>
                  <th class="w-8 p-2"><UCheckbox v-model="allPendingSelected" /></th>
                  <th class="p-2">Order</th>
                  <th>AWB</th>
                  <th>Customer</th>
                  <th>Destination</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in pendingOrders" :key="o.id" class="border-t border-gray-100 dark:border-gray-800">
                  <td class="p-2"><UCheckbox v-model="pendingSelected" :value="o.id" /></td>
                  <td class="p-2 font-medium text-gray-900 dark:text-white">
                    #{{ o.orderNumber }}
                    <!-- Which leg of the order this parcel is: the original one
                         going out, or the replacement for an exchange. -->
                    <UBadge v-if="o.kind === 'exchange'" color="violet" variant="subtle" size="xs" class="ml-1">
                      exchange
                    </UBadge>
                    <UBadge v-if="o.excluded" color="amber" variant="subtle" size="xs" class="ml-1">held back</UBadge>
                  </td>
                  <td class="font-mono text-xs">{{ o.awb }}</td>
                  <td class="truncate max-w-[150px]">{{ o.customer || '—' }}</td>
                  <td class="text-gray-500">{{ [o.city, o.pincode].filter(Boolean).join(', ') || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <template #footer>
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-gray-500">
              Delhivery is told to expect {{ pendingSelected.length }} parcel(s).
            </span>
            <div class="flex gap-2">
              <UButton variant="ghost" color="gray" @click="confirmOpen = false">Cancel</UButton>
              <UButton
                icon="i-heroicons-truck"
                :loading="raising"
                :disabled="!pendingSelected.length"
                @click="raisePickup"
              >
                Raise pickup for {{ pendingSelected.length }}
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Pickup requests table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Pickup Requests</h2>
          <UButton icon="i-heroicons-arrow-path" size="xs" color="gray" variant="ghost" :loading="loadingRequests" @click="loadRequests" />
        </div>
      </template>

      <div v-if="loadingRequests && !requests.length" class="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-lg" />
        Loading pickup requests…
      </div>

      <div v-else-if="!requests.length" class="py-10 text-center text-sm text-gray-500">
        No pickup requests yet. Raise one above once you have shipped orders.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[850px] text-sm">
          <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:bg-gray-900/60">
            <tr>
              <th class="px-4 py-3">Pickup</th>
              <th class="px-4 py-3">Schedule</th>
              <th class="px-4 py-3">Location</th>
              <th class="px-4 py-3">Carrier</th>
              <th class="px-4 py-3 text-center">Parcels</th>
              <th class="px-4 py-3">Status</th>
              <th class="w-16 px-4 py-3 text-right"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr
              v-for="(req, index) in requests"
              :key="req.id"
              class="cursor-pointer transition-colors hover:bg-primary-50/60 focus:bg-primary-50/60 focus:outline-none dark:hover:bg-primary-950/20 dark:focus:bg-primary-950/20"
              tabindex="0"
              @click="openRequest(req)"
              @keydown.enter.prevent="openRequest(req)"
              @keydown.space.prevent="openRequest(req)"
            >
              <td class="px-4 py-3">
                <p class="font-medium text-gray-900 dark:text-white">{{ requestReference(req, index) }}</p>
                <p v-if="req.carrierPickupId" class="mt-0.5 font-mono text-xs text-gray-400">{{ req.carrierPickupId }}</p>
                <UBadge v-else color="red" variant="subtle" size="xs" class="mt-1">Not created in Delhivery</UBadge>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-200">
                <p>{{ pickupSchedule(req) }}</p>
                <p class="mt-1 text-xs text-gray-500">Requested: {{ requestedSchedule(req) }}</p>
              </td>
              <td class="px-4 py-3 text-gray-700 dark:text-gray-200">{{ req.location || '—' }}</td>
              <td class="px-4 py-3 capitalize text-gray-700 dark:text-gray-200">{{ req.carrier || '—' }}</td>
              <td class="px-4 py-3 text-center font-medium text-gray-900 dark:text-white">{{ req.orderCount ?? 0 }}</td>
              <td class="px-4 py-3">
                <UBadge :color="statusColor(req.status)" variant="subtle" size="xs">{{ req.status }}</UBadge>
              </td>
              <td class="px-4 py-3 text-right" @click.stop @keydown.stop>
                <UDropdown :items="requestActions(req)" :popper="{ placement: 'bottom-end' }">
                  <UButton
                    icon="i-heroicons-ellipsis-vertical-20-solid"
                    color="gray"
                    variant="ghost"
                    size="xs"
                    title="Pickup actions"
                  />
                </UDropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Pickup request details and the products physically included in it. -->
    <USlideover v-model="requestDetailsOpen" :ui="{ width: 'max-w-4xl' }">
      <div v-if="selectedRequest" class="flex h-full flex-col bg-white dark:bg-gray-950">
        <div class="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Pickup request</p>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <h2 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
                {{ selectedRequest.carrierPickupId || selectedRequest.id }}
              </h2>
              <UBadge :color="statusColor(selectedRequest.status)" variant="subtle" size="xs">
                {{ selectedRequest.status }}
              </UBadge>
            </div>
            <p class="mt-1 text-sm text-gray-500">{{ pickupSchedule(selectedRequest) }}</p>
            <p class="mt-1 text-xs text-gray-500">Requested: {{ requestedSchedule(selectedRequest) }}</p>
            <p v-if="selectedRequest.carrierSchedule" class="mt-1 text-xs text-gray-400">Carrier slot recorded from Delhivery One</p>
          </div>
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="requestDetailsOpen = false" />
        </div>

        <div class="flex-1 space-y-6 overflow-y-auto p-5">
          <dl class="grid gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-gray-800 dark:bg-gray-900/50">
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Location</dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ selectedRequest.location || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Carrier</dt>
              <dd class="mt-1 text-sm font-medium capitalize text-gray-900 dark:text-white">{{ selectedRequest.carrier || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Parcels</dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ selectedRequest.orderCount ?? 0 }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Packages</dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ selectedRequest.packageCount ?? 0 }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs uppercase tracking-wide text-gray-400">Requested on</dt>
              <dd class="mt-1 text-sm text-gray-700 dark:text-gray-200">{{ createdOn(selectedRequest.createdAt) }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs uppercase tracking-wide text-gray-400">Internal reference</dt>
              <dd class="mt-1 break-all font-mono text-xs text-gray-500">{{ selectedRequest.id }}</dd>
            </div>
          </dl>

          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">Products in this pickup</h3>
            <p class="mt-1 text-sm text-gray-500">Markit's planned handover list, grouped by parcel. Delhivery's warehouse pickup API does not attach these AWBs to the pickup's order list in Delhivery One.</p>
          </div>

          <div v-if="!selectedRequest.shipments?.length" class="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500 dark:border-gray-700">
            No attached parcel details are available for this pickup.
          </div>

          <section
            v-for="shipment in selectedRequest.shipments || []"
            v-else
            :key="shipment.id"
            class="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
          >
            <div class="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-semibold text-gray-900 dark:text-white">Order #{{ shipment.orderNumber || '—' }}</p>
                  <UBadge v-if="shipment.kind === 'exchange'" color="violet" variant="subtle" size="xs">Exchange</UBadge>
                </div>
                <p class="mt-1 text-xs text-gray-500">{{ shipment.customer || 'Customer unavailable' }}</p>
              </div>
              <div class="text-left sm:text-right">
                <p class="text-xs uppercase tracking-wide text-gray-400">AWB</p>
                <p class="font-mono text-xs text-gray-600 dark:text-gray-300">{{ shipment.awb || '—' }}</p>
              </div>
            </div>

            <div v-if="!shipment.products?.length" class="px-4 py-8 text-center text-sm text-gray-500">
              No product snapshot is available for this parcel.
            </div>

            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[620px] text-sm">
                <thead class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                  <tr>
                    <th class="px-4 py-3">Product</th>
                    <th class="px-4 py-3">Size</th>
                    <th class="px-4 py-3 text-right">Qty</th>
                    <th class="px-4 py-3 text-right">Rate</th>
                    <th class="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="product in shipment.products" :key="product.id">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <img v-if="product.image" :src="product.image" :alt="product.name" class="h-10 w-10 rounded-md object-cover" />
                        <div v-else class="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-400 dark:bg-gray-800">
                          <UIcon name="i-heroicons-cube" class="h-5 w-5" />
                        </div>
                        <div class="min-w-0">
                          <p class="font-medium text-gray-900 dark:text-white">{{ product.name }}</p>
                          <p class="truncate text-xs text-gray-500">
                            {{ [product.variantName, product.barcode].filter(Boolean).join(' · ') || '—' }}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-gray-600 dark:text-gray-300">{{ product.size || '—' }}</td>
                    <td class="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{{ product.quantity }}</td>
                    <td class="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{{ money(product.rate) }}</td>
                    <td class="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{{ money(productAmount(product)) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </USlideover>

    <!-- Locations -->
    <UCard>
      <template #header>
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">Pickup Locations</h2>
      </template>

      <div v-if="isLoading" class="flex items-center justify-center py-16 text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl" />
      </div>

      <div v-else-if="!(locations || []).length" class="flex flex-col items-center gap-3 py-16 text-center">
        <UIcon name="i-heroicons-building-storefront" class="h-10 w-10 text-gray-400" />
        <p class="text-sm font-medium text-gray-900 dark:text-white">No pickup locations yet</p>
        <UButton size="sm" variant="soft" icon="i-heroicons-plus" @click="openCreate">Add your first location</UButton>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="loc in locations"
          :key="loc.id"
          class="rounded-xl border-2 p-4 flex flex-col gap-3"
          :class="loc.isDefault ? 'border-primary-400 dark:border-primary-500' : 'border-gray-100 dark:border-gray-800'"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold text-gray-900 dark:text-white">{{ loc.name }}</p>
              <p class="text-xs text-gray-500">{{ loc.contactName }} · {{ loc.phone }}</p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <UBadge v-if="loc.isDefault" color="primary" variant="subtle" size="xs">Default</UBadge>
              <UBadge :color="loc.registeredWithCarrier ? 'green' : 'gray'" variant="subtle" size="xs">
                {{ loc.registeredWithCarrier ? 'Registered' : 'Not registered' }}
              </UBadge>
            </div>
          </div>

          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{ [loc.address, loc.city, loc.state, loc.pincode].filter(Boolean).join(', ') }}
          </p>

          <div class="mt-auto flex flex-wrap gap-2">
            <UButton
              size="xs"
              :color="loc.registeredWithCarrier ? 'gray' : 'primary'"
              :variant="loc.registeredWithCarrier ? 'soft' : 'solid'"
              icon="i-heroicons-link"
              :loading="registeringId === loc.id"
              @click="registerWithCarrier(loc)"
            >
              {{ loc.registeredWithCarrier ? 'Re-sync' : 'Register' }}
            </UButton>
            <UButton v-if="!loc.isDefault" size="xs" color="gray" variant="ghost" icon="i-heroicons-star" @click="setDefault(loc)">Set default</UButton>
            <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-pencil-square" @click="openEdit(loc)" />
            <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="remove(loc)" />
          </div>
        </div>
      </div>
    </UCard>

    <UModal v-model="modalOpen" :ui="{ width: 'sm:max-w-lg' }">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">{{ editing ? 'Edit' : 'Add' }} Pickup Location</h2>
        </template>
        <div class="grid grid-cols-2 gap-3">
          <UFormGroup
            v-for="f in fields"
            :key="f.key"
            :label="f.label"
            :class="f.half ? 'col-span-1' : 'col-span-2'"
            :help="f.key === 'name' && nameLocked
              ? 'Delhivery cannot rename a registered warehouse — add a new location instead'
              : undefined"
          >
            <!-- The name is the key Delhivery matches every shipment and pickup
                 against, and its edit API cannot change it. Once registered it
                 is locked, or the local name and the carrier's would drift. -->
            <UInput v-model="(form as any)[f.key]" :disabled="f.key === 'name' && nameLocked" />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="modalOpen = false">Cancel</UButton>
            <UButton :loading="isCreating || isUpdating" :disabled="!isValid" @click="save">{{ editing ? 'Save' : 'Add' }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
  <PickupAddOrdersModal v-model="addOrdersOpen" :pickup="addOrdersPickup" @saved="loadRequests(); refreshRemaining()" />
  <PickupCarrierScheduleModal v-model="carrierScheduleOpen" :pickup="carrierSchedulePickup" @saved="loadRequests" />
  </UDashboardPanelContent>
</template>
