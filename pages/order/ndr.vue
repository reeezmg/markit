<script setup lang="ts">
import { format } from 'date-fns';

definePageMeta({ auth: true });

const toast = useToast();
const orders = ref<any[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/orders/ndr');
    orders.value = res.orders || [];
  } catch (e: any) {
    toast.add({ title: 'Could not load NDR orders', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const orderLabel = (o: any) => (o.orderNumber ? `#${o.orderNumber}` : o.id?.slice(0, 8));
const customerName = (o: any) => {
  const a = o.shippingAddress || {};
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || 'Customer';
};
const addressLine = (o: any) => {
  const a = o.shippingAddress || {};
  return a.formattedAddress || [a.street, a.locality, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ');
};

// ─── Action modal ──────────────────────────────────────────────────────────
const ACTIONS = ['RE-ATTEMPT', 'DEFER_DELIVERY', 'RTO'];
const modalOpen = ref(false);
const actOrder = ref<any>(null);
const busy = ref(false);
const actForm = ref({ action: 'RE-ATTEMPT', name: '', phone: '', address: '', pincode: '', remarks: '' });

function openAct(o: any) {
  const a = o.shippingAddress || {};
  actOrder.value = o;
  actForm.value = {
    action: 'RE-ATTEMPT',
    name: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || '',
    phone: a.phoneNo || a.phone || '',
    address: [a.street, a.locality, a.landmark].filter(Boolean).join(', ') || a.formattedAddress || '',
    pincode: a.pincode || '',
    remarks: '',
  };
  modalOpen.value = true;
}

const isReattempt = computed(() => actForm.value.action === 'RE-ATTEMPT');

async function submitAct() {
  const awb = actOrder.value?.shipping?.awb;
  if (!awb) return;
  busy.value = true;
  try {
    const body: any = { awb, action: actForm.value.action, remarks: actForm.value.remarks };
    if (isReattempt.value) {
      Object.assign(body, {
        name: actForm.value.name, phone: actForm.value.phone,
        address: actForm.value.address, pincode: actForm.value.pincode,
      });
    }
    await $fetch('/api/ecommerce-cms/shipping/ndr', { method: 'POST', body });
    toast.add({ title: `NDR action submitted (${actForm.value.action})`, color: 'green' });
    modalOpen.value = false;
    load();
  } catch (e: any) {
    toast.add({ title: 'NDR action failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">NDR — Failed Deliveries</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Orders the carrier couldn't deliver. Re-attempt (optionally with a corrected address), defer, or return to origin.
        </p>
      </div>
      <UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" :loading="loading" @click="load">Refresh</UButton>
    </div>

    <UCard>
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl" />
      </div>

      <div v-else-if="!orders.length" class="flex flex-col items-center gap-3 py-16 text-center">
        <UIcon name="i-heroicons-check-circle" class="h-10 w-10 text-green-400" />
        <p class="text-sm font-medium text-gray-900 dark:text-white">No failed deliveries</p>
        <p class="text-sm text-gray-500 dark:text-gray-400">Orders the carrier reports as undelivered will appear here.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="o in orders"
          :key="o.id"
          class="flex flex-col gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-gray-900 dark:text-white">{{ orderLabel(o) }}</span>
              <UBadge color="amber" variant="subtle" size="xs">NDR · attempt {{ o.shipping?.ndr?.attempts || 1 }}</UBadge>
              <UBadge color="gray" variant="subtle" size="xs">AWB {{ o.shipping?.awb }}</UBadge>
            </div>
            <p class="mt-1 text-sm text-amber-700 dark:text-amber-300 font-medium">
              {{ o.shipping?.ndr?.reason || 'Delivery attempt failed' }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500">{{ customerName(o) }} · {{ addressLine(o) }}</p>
            <p v-if="o.shipping?.ndr?.at" class="text-xs text-gray-400">
              Reported {{ format(new Date(o.shipping.ndr.at), 'dd MMM, hh:mm a') }}
            </p>
          </div>
          <UButton icon="i-heroicons-wrench-screwdriver" class="shrink-0" @click="openAct(o)">Act</UButton>
        </div>
      </div>
    </UCard>

    <UModal v-model="modalOpen" :ui="{ width: 'sm:max-w-lg' }">
      <UCard v-if="actOrder">
        <template #header>
          <h2 class="text-lg font-semibold">Resolve NDR · {{ orderLabel(actOrder) }}</h2>
          <p class="text-xs text-gray-500">{{ actOrder.shipping?.ndr?.reason }}</p>
        </template>

        <div class="space-y-3">
          <UFormGroup label="Action">
            <USelect v-model="actForm.action" :options="ACTIONS" />
          </UFormGroup>

          <template v-if="isReattempt">
            <p class="text-xs text-gray-400">Corrected delivery details (edit if the address/phone was the issue)</p>
            <div class="grid grid-cols-2 gap-2">
              <UFormGroup label="Name"><UInput v-model="actForm.name" /></UFormGroup>
              <UFormGroup label="Phone"><UInput v-model="actForm.phone" /></UFormGroup>
              <UFormGroup label="Pincode"><UInput v-model="actForm.pincode" /></UFormGroup>
            </div>
            <UFormGroup label="Address"><UInput v-model="actForm.address" /></UFormGroup>
          </template>

          <UFormGroup label="Remarks">
            <UInput v-model="actForm.remarks" placeholder="Note for the carrier (optional)" />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="modalOpen = false">Cancel</UButton>
            <UButton :loading="busy" icon="i-heroicons-paper-airplane" @click="submitAct">Submit</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
