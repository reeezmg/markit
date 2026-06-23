<script setup lang="ts">
import { format } from 'date-fns';
import {
  useFindManyEcommPickupLocation,
  useCreateEcommPickupLocation,
  useUpdateEcommPickupLocation,
  useUpdateManyEcommPickupLocation,
  useDeleteEcommPickupLocation,
} from '~/lib/hooks';

definePageMeta({ auth: true });

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

// ─── Pickup locations (warehouses) ──────────────────────────────────────────
const { data: locations, isLoading, refetch } = useFindManyEcommPickupLocation(
  computed(() => ({
    where: { companyId: companyId.value },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })),
  { enabled: computed(() => Boolean(companyId.value)) },
);

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

const isValid = computed(() =>
  fields.filter((f) => f.required).every((f) => String(form.value[f.key] || '').trim() !== ''),
);

function openCreate() { form.value = blank(); modalOpen.value = true; }
function openEdit(loc: any) { form.value = { ...blank(), ...loc }; modalOpen.value = true; }

function save() {
  if (!isValid.value) return;
  const { id, ...data } = form.value;
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
    toast.add({ title: 'Delhivery sync failed', description: e.data?.statusMessage || e.message, color: 'red' });
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

async function raisePickup() {
  const { location, date, time, carriers } = pickupForm.value;
  if (!location || !date || !carriers.length) return;
  raising.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/pickup/raise', { method: 'POST', body: { location, date, time, carriers } });
    const ok = (res.results || []).filter((r: any) => r.ok);
    const failed = (res.results || []).filter((r: any) => !r.ok);
    if (ok.length) toast.add({ title: `Pickup raised: ${ok.map((r: any) => `${r.carrier} (${r.orders} orders)`).join(', ')}`, color: 'green' });
    if (failed.length) toast.add({ title: `Failed: ${failed.map((r: any) => r.carrier).join(', ')}`, description: failed[0]?.error, color: 'red' });
    await Promise.all([loadRequests(), refreshRemaining()]);
  } catch (e: any) {
    toast.add({ title: 'Raise pickup failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally { raising.value = false; }
}

// ─── Pickup requests table ──────────────────────────────────────────────────
const requests = ref<any[]>([]);
const loadingRequests = ref(false);
const STATUSES = ['REQUESTED', 'PICKED', 'CANCELLED'];
const statusColor = (s: string) => (s === 'PICKED' ? 'green' : s === 'CANCELLED' ? 'red' : 'amber');

async function loadRequests() {
  loadingRequests.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/pickup/requests');
    requests.value = res.requests || [];
  } catch (e: any) {
    toast.add({ title: 'Could not load pickup requests', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally { loadingRequests.value = false; }
}

async function updateStatus(req: any, status: string) {
  if (status === req.status) return;
  try {
    await $fetch('/api/ecommerce-cms/pickup/status', { method: 'POST', body: { id: req.id, status } });
    toast.add({ title: `Pickup marked ${status}`, color: 'green' });
    loadRequests();
  } catch (e: any) {
    toast.add({ title: 'Status update failed', description: e.data?.statusMessage || e.message, color: 'red' });
  }
}

onMounted(async () => {
  loadRequests();
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/providers');
    pickupProviders.value = (res.providers || []).filter((p: any) => p.supportsPickup);
  } catch { /* no shipping config yet */ }
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

    <!-- Raise pickup -->
    <UCard v-if="pickupProviders.length">
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
            placeholder="Select carriers"
          />
        </UFormGroup>
      </div>
      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs text-gray-500">
          <UIcon name="i-heroicons-cube" class="align-text-bottom" />
          {{ remainingCount }} remaining order{{ remainingCount === 1 ? '' : 's' }} will be auto-attached.
        </p>
        <UButton
          icon="i-heroicons-truck"
          :loading="raising"
          :disabled="!pickupForm.carriers.length || !pickupForm.location || !pickupForm.date"
          @click="raisePickup"
        >
          Raise Pickup
        </UButton>
      </div>
    </UCard>

    <!-- Pickup requests table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Pickup Requests</h2>
          <UButton icon="i-heroicons-arrow-path" size="xs" color="gray" variant="ghost" :loading="loadingRequests" @click="loadRequests" />
        </div>
      </template>

      <div v-if="!requests.length" class="py-10 text-center text-sm text-gray-500">
        No pickup requests yet. Raise one above once you have shipped orders.
      </div>

      <table v-else class="w-full text-sm">
        <thead class="text-left text-xs uppercase text-gray-400">
          <tr>
            <th class="py-2">Date</th>
            <th>Location</th>
            <th>Carrier</th>
            <th>Orders</th>
            <th>Packages</th>
            <th>Pickup ID</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req in requests" :key="req.id" class="border-t border-gray-100 dark:border-gray-800">
            <td class="py-2">{{ req.pickupDate }} <span class="text-gray-400">{{ req.pickupTime }}</span></td>
            <td>{{ req.location }}</td>
            <td class="capitalize">{{ req.carrier }}</td>
            <td>{{ req.orderCount }}</td>
            <td>{{ req.packageCount }}</td>
            <td class="text-gray-400">{{ req.carrierPickupId || '—' }}</td>
            <td>
              <div class="flex items-center gap-2">
                <UBadge :color="statusColor(req.status)" variant="subtle" size="xs">{{ req.status }}</UBadge>
                <USelect
                  v-if="req.status !== 'CANCELLED' && req.status !== 'PICKED'"
                  :model-value="req.status"
                  :options="STATUSES"
                  size="xs"
                  @update:model-value="(v) => updateStatus(req, v)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>

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
          <UFormGroup v-for="f in fields" :key="f.key" :label="f.label" :class="f.half ? 'col-span-1' : 'col-span-2'">
            <UInput v-model="(form as any)[f.key]" />
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
  </UDashboardPanelContent>
</template>
