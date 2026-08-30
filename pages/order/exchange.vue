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
    toast.add({ title: 'Could not load exchange requests', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
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
// → old item back to the warehouse. A failure on any leg surfaces as an NSL
// code, and the carrier's rules for acting on it are in utils/ndr.ts.
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

// The exception and what can be done about it. The NSL code alone is not
// enough: the carrier also requires the attempt count to be 1 or 2.
const ndr = (r: any) => (isNdrException(exchangeLive(r)) ? ndrVerdict(exchangeLive(r)) : null);

// ─── Raising a request on the customer's behalf ──────────────────────────────
// Not every exchange comes through the storefront - some arrive by phone or message,
// and the seller records them here. See components/OrderRequestModal.vue.
const newRequestOpen = ref(false);

// ─── Actions ─────────────────────────────────────────────────────────────────
const busyId = ref<string | null>(null);

async function decide(r: any, status: 'APPROVED' | 'REJECTED') {
  busyId.value = r.id;
  try {
    await $fetch('/api/ecommerce-cms/returns/status', { method: 'POST', body: { id: r.id, status } });
    toast.add({ title: `Request ${status.toLowerCase()}`, color: status === 'APPROVED' ? 'green' : 'orange' });
    await load();
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
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
    toast.add({ title: 'Exchange shipment failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally {
    busyId.value = null;
  }
}

async function submitNdr(r: any) {
  const awb = exchangeAwb(r);
  const verdict = ndr(r);
  if (!awb || !verdict?.actionable) return;
  busyId.value = r.id;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/ndr', {
      method: 'POST',
      body: { awb, action: verdict.action },
    });
    toast.add({
      title: `${verdict.label} queued`,
      description: res?.uplId ? `Request ID ${res.uplId}` : 'Request submitted to the carrier.',
      color: 'green',
    });
    await load();
  } catch (e: any) {
    toast.add({
      title: `${verdict.label} failed`,
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
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
        <UButton icon="i-heroicons-plus" @click="newRequestOpen = true">New exchange</UButton>
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
        <p class="text-sm text-gray-500 dark:text-gray-400">Requests from your storefront appear here. Raise one yourself with New exchange if a customer asked by phone or message.</p>
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
              <UBadge v-if="ndr(r)" color="amber" variant="subtle" size="xs" :title="ndr(r)!.reason">
                {{ ndr(r)!.label }} · {{ ndr(r)!.nsl || 'exception' }} · {{ ndr(r)!.attempts }} attempt(s)
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
              v-if="ndr(r)"
              icon="i-heroicons-arrow-path"
              color="amber"
              variant="soft"
              :loading="busyId === r.id"
              :disabled="!ndr(r)!.actionable"
              :title="ndr(r)!.blockedReason || (beforeNdrWindow() ? 'Delhivery asks for NDR actions after 9 PM' : ndr(r)!.label)"
              @click="submitNdr(r)"
            >{{ ndr(r)!.actionable ? ndr(r)!.label : 'Blocked' }}</UButton>
          </div>
        </div>
      </div>
    </UCard>
    <OrderRequestModal v-model="newRequestOpen" type="exchange" @created="load" />
  </div>
</template>
