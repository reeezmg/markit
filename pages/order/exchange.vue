<script setup lang="ts">
import { format } from 'date-fns';

definePageMeta({ auth: true });

const toast = useToast();
const requests = ref<any[]>([]);
const loading = ref(true);
const statusFilter = ref('All');
const statusOptions = ['All', 'PENDING', 'APPROVED', 'REJECTED'];

async function load() {
  loading.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/returns');
    requests.value = (res.requests || []).filter((r: any) => r.type === 'exchange');
    await refreshExchangeStatuses();
  } catch (e: any) {
    toast.add({ title: 'Could not load exchange requests', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const filtered = computed(() =>
  requests.value.filter((r) => statusFilter.value === 'All' || (r.status || '').toUpperCase() === statusFilter.value));

const orderLabel = (r: any) => (r.orderNumber ? `#${r.orderNumber}` : r.orderId?.slice(0, 8));
const customerName = (r: any) => {
  const a = r.shippingAddress || {};
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || 'Customer';
};
const addressLine = (r: any) => {
  const a = r.shippingAddress || {};
  return a.formattedAddress || [a.houseDetails, a.street, a.locality, a.city, a.state, a.pincode].filter(Boolean).join(', ');
};
const itemsSummary = (r: any) => {
  const items = Array.isArray(r.items) && r.items.length ? r.items : [];
  if (!items.length) return 'All items';
  return items.map((i: any) => `${i.name || i.variantName || 'Item'} ×${i.quantity || i.qty || 1}`).join(', ');
};
const requestBadge = (s: string) => (s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : 'amber');

const exchangeAwb = (r: any) => r.meta?.exchangeAwb || r.shipping?.exchange?.awb || null;

// ─── Live tracking of exchange (REPL) shipments ──────────────────────────────
// One waybill covers the whole journey: replacement out → swap at the customer
// → old item back to the warehouse. Failed delivery/swap attempts surface as
// RE-ATTEMPT NSL codes; a cancelled shipment as EOD-777 / EOD-21.
const REATTEMPT_NSL = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
const RESCHEDULE_NSL = ['EOD-777', 'EOD-21'];
const liveStatus = ref<Record<string, any>>({});

async function refreshExchangeStatuses() {
  const awbs = [...new Set(requests.value.map(exchangeAwb).filter(Boolean))] as string[];
  if (!awbs.length) return;
  try {
    const merged: Record<string, any> = {};
    for (let i = 0; i < awbs.length; i += 50) {
      const res: any = await $fetch('/api/ecommerce-cms/shipping/track-bulk', {
        query: { waybills: awbs.slice(i, i + 50).join(',') },
      });
      Object.assign(merged, res.statuses || {});
    }
    liveStatus.value = merged;
  } catch { /* keep whatever we had */ }
}

const exchangeLive = (r: any) => {
  const awb = exchangeAwb(r);
  return awb ? liveStatus.value[awb] : null;
};
const ndrAction = (r: any) => {
  const nsl = (exchangeLive(r)?.nslCode || '').toUpperCase();
  if (REATTEMPT_NSL.includes(nsl)) return 'RE-ATTEMPT';
  if (RESCHEDULE_NSL.includes(nsl)) return 'PICKUP_RESCHEDULE';
  return null;
};

// ─── Actions ─────────────────────────────────────────────────────────────────
const busyId = ref<string | null>(null);

async function decide(r: any, status: 'APPROVED' | 'REJECTED') {
  busyId.value = r.id;
  try {
    await $fetch('/api/ecommerce-cms/returns/status', { method: 'POST', body: { id: r.id, status } });
    toast.add({ title: `Request ${status.toLowerCase()}`, color: status === 'APPROVED' ? 'green' : 'orange' });
    await load();
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busyId.value = null;
  }
}

async function createExchange(r: any) {
  busyId.value = r.id;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/exchange', {
      method: 'POST',
      body: { requestId: r.id },
    });
    toast.add({ title: 'Exchange shipment created', description: `AWB ${res.awb}`, color: 'green' });
    await load();
  } catch (e: any) {
    toast.add({ title: 'Exchange shipment failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busyId.value = null;
  }
}

async function submitNdr(r: any) {
  const awb = exchangeAwb(r);
  const action = ndrAction(r);
  if (!awb || !action) return;
  busyId.value = r.id;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/ndr', {
      method: 'POST',
      body: { awb, action },
    });
    toast.add({
      title: `NDR action queued (${action})`,
      description: res?.uplId ? `Request ID ${res.uplId}` : 'Request submitted to the carrier.',
      color: 'green',
    });
    await load();
  } catch (e: any) {
    toast.add({ title: 'NDR action failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Exchanges</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Customer exchange requests. Approve, then create the exchange (REPL) shipment — one waybill delivers the replacement, collects the old item at the customer's door, and returns it to your warehouse.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <USelect v-model="statusFilter" :options="statusOptions" class="w-36" />
        <UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" :loading="loading" @click="load">Refresh</UButton>
      </div>
    </div>

    <UCard>
      <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl" />
      </div>

      <div v-else-if="!filtered.length" class="flex flex-col items-center gap-3 py-16 text-center">
        <UIcon name="i-heroicons-arrows-right-left" class="h-10 w-10 text-gray-400" />
        <p class="text-sm font-medium text-gray-900 dark:text-white">No exchange requests</p>
        <p class="text-sm text-gray-500 dark:text-gray-400">Exchange requests from your storefront will appear here.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="r in filtered"
          :key="r.id"
          class="flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-gray-900 dark:text-white">{{ orderLabel(r) }}</span>
              <UBadge :color="requestBadge(r.status)" variant="subtle" size="xs">{{ r.status }}</UBadge>
              <UBadge v-if="exchangeAwb(r)" color="blue" variant="subtle" size="xs">REPL {{ exchangeAwb(r) }}</UBadge>
              <UBadge
                v-if="exchangeLive(r)?.status || exchangeLive(r)?.rawStatus"
                color="violet"
                variant="subtle"
                size="xs"
                :title="exchangeLive(r)?.instructions || ''"
              >
                {{ exchangeLive(r)?.status || exchangeLive(r)?.rawStatus }}
              </UBadge>
              <UBadge v-if="ndrAction(r)" color="amber" variant="subtle" size="xs">
                {{ ndrAction(r) === 'RE-ATTEMPT' ? 'Attempt failed' : 'Shipment cancelled' }} · {{ exchangeLive(r)?.nslCode }}
              </UBadge>
            </div>
            <p v-if="r.reason" class="mt-1 text-sm text-gray-700 dark:text-gray-300">{{ r.reason }}</p>
            <p class="mt-0.5 text-xs text-gray-500 truncate">{{ itemsSummary(r) }}</p>
            <p class="mt-0.5 text-xs text-gray-500">{{ customerName(r) }} · {{ addressLine(r) }}</p>
            <p class="text-xs text-gray-400">
              Requested {{ format(new Date(r.createdAt), 'dd MMM yyyy, hh:mm a') }}
              <span v-if="r.fee"> · fee ₹{{ r.fee }}</span>
            </p>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <template v-if="r.status === 'PENDING'">
              <UButton
                icon="i-heroicons-check"
                color="green"
                variant="soft"
                :loading="busyId === r.id"
                @click="decide(r, 'APPROVED')"
              >Approve</UButton>
              <UButton
                icon="i-heroicons-x-mark"
                color="red"
                variant="soft"
                :loading="busyId === r.id"
                @click="decide(r, 'REJECTED')"
              >Reject</UButton>
            </template>

            <UButton
              v-if="r.status === 'APPROVED' && !exchangeAwb(r)"
              icon="i-heroicons-arrows-right-left"
              :loading="busyId === r.id"
              @click="createExchange(r)"
            >Create exchange shipment</UButton>

            <UButton
              v-if="ndrAction(r)"
              icon="i-heroicons-arrow-path"
              color="amber"
              variant="soft"
              :loading="busyId === r.id"
              @click="submitNdr(r)"
            >{{ ndrAction(r) === 'RE-ATTEMPT' ? 'Re-attempt' : 'Reschedule pickup' }}</UButton>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
