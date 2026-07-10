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
    // Exchanges have their own page (/order/exchange) — this one is returns only.
    requests.value = (res.requests || []).filter((r: any) => r.type === 'return');
    await refreshReverseStatuses();
  } catch (e: any) {
    toast.add({ title: 'Could not load return requests', description: e.data?.statusMessage || e.message, color: 'red' });
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

const reverseAwb = (r: any) => r.meta?.reverseAwb || r.shipping?.reverse?.awb || null;

// ─── Live tracking of reverse shipments ──────────────────────────────────────
// Same track API as the orders page; for a reverse AWB the NSL codes
// EOD-777 / EOD-21 mean the customer pickup was cancelled (non-OTP) and can be
// revived with PICKUP_RESCHEDULE after 1-2 failed attempts.
const RESCHEDULE_NSL = ['EOD-777', 'EOD-21'];
const liveStatus = ref<Record<string, any>>({});

async function refreshReverseStatuses() {
  const awbs = [...new Set(requests.value.map(reverseAwb).filter(Boolean))] as string[];
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

const reverseLive = (r: any) => {
  const awb = reverseAwb(r);
  return awb ? liveStatus.value[awb] : null;
};
const canReschedule = (r: any) => {
  const nsl = (reverseLive(r)?.nslCode || '').toUpperCase();
  return RESCHEDULE_NSL.includes(nsl);
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

async function createReverse(r: any) {
  busyId.value = r.id;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/reverse', {
      method: 'POST',
      body: { requestId: r.id },
    });
    toast.add({ title: 'Reverse pickup created', description: `AWB ${res.awb}`, color: 'green' });
    await load();
  } catch (e: any) {
    toast.add({ title: 'Reverse pickup failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busyId.value = null;
  }
}

async function reschedulePickup(r: any) {
  const awb = reverseAwb(r);
  if (!awb) return;
  busyId.value = r.id;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/ndr', {
      method: 'POST',
      body: { awb, action: 'PICKUP_RESCHEDULE' },
    });
    toast.add({
      title: 'Pickup reschedule queued',
      description: res?.uplId ? `Request ID ${res.uplId}` : 'Request submitted to the carrier.',
      color: 'green',
    });
    await load();
  } catch (e: any) {
    toast.add({ title: 'Reschedule failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Returns</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Customer return requests. Approve a return, create the reverse pickup with the carrier, and track it back to your warehouse.
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
        <UIcon name="i-heroicons-arrow-uturn-left" class="h-10 w-10 text-gray-400" />
        <p class="text-sm font-medium text-gray-900 dark:text-white">No return requests</p>
        <p class="text-sm text-gray-500 dark:text-gray-400">Return and exchange requests from your storefront will appear here.</p>
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
              <UBadge color="gray" variant="subtle" size="xs" class="capitalize">{{ r.type }}</UBadge>
              <UBadge :color="requestBadge(r.status)" variant="subtle" size="xs">{{ r.status }}</UBadge>
              <UBadge v-if="reverseAwb(r)" color="blue" variant="subtle" size="xs">RVP {{ reverseAwb(r) }}</UBadge>
              <UBadge
                v-if="reverseLive(r)?.status || reverseLive(r)?.rawStatus"
                color="violet"
                variant="subtle"
                size="xs"
                :title="reverseLive(r)?.instructions || ''"
              >
                {{ reverseLive(r)?.status || reverseLive(r)?.rawStatus }}
              </UBadge>
              <UBadge v-if="canReschedule(r)" color="amber" variant="subtle" size="xs">
                Pickup cancelled · {{ reverseLive(r)?.nslCode }}
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
              v-if="r.status === 'APPROVED' && !reverseAwb(r)"
              icon="i-heroicons-truck"
              :loading="busyId === r.id"
              @click="createReverse(r)"
            >Create reverse pickup</UButton>

            <UButton
              v-if="canReschedule(r)"
              icon="i-heroicons-arrow-path"
              color="amber"
              variant="soft"
              :loading="busyId === r.id"
              @click="reschedulePickup(r)"
            >Reschedule pickup</UButton>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
