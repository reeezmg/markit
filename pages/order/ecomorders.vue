<script setup lang="ts">
import { format } from 'date-fns';
import { useFindManyEcommOrder } from '~/lib/hooks';

definePageMeta({ auth: true });

const useAuth = () => useNuxtApp().$auth;
const companyId = computed(() => useAuth().session.value?.companyId || '');

const search = ref('');
const statusFilter = ref('All');
const paymentFilter = ref('All');

const statusOptions = ['All', 'PLACED', 'PACKED', 'PICKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'RTO_DELIVERED', 'CANCELLED'];
const paymentOptions = ['All', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'];

const { data: orders, isLoading, refetch } = useFindManyEcommOrder(
  computed(() => ({
    where: { companyId: companyId.value },
    include: {
      client: {
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },
      bill: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })),
  { enabled: computed(() => Boolean(companyId.value)) },
);

const columns = [
  { key: 'order', label: 'Order' },
  { key: 'createdAt', label: 'Date' },
  { key: 'customer', label: 'Customer' },
  { key: 'items', label: 'Items' },
  { key: 'payment', label: 'Payment' },
  { key: 'status', label: 'Status' },
  { key: 'shipment', label: 'Shipment' },
  { key: 'grandTotal', label: 'Total' },
  { key: 'actions', label: 'Actions' },
];

// Box / weight info stored on the order after (bulk) shipment creation.
const shipInfo = (row: any) => row?.meta?.shipping || null;

const money = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const orderLabel = (order: any) => order.orderNumber ? `#${order.orderNumber}` : order.id?.slice(0, 8);

const itemCount = (order: any) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((total, item) => total + Number(item.quantity || item.qty || 1), 0);
};

const firstItems = (order: any) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.slice(0, 3).map((item) => item.name || item.variantName || 'Item').join(', ');
};

const addressLine = (order: any) => {
  const address = order.shippingAddress || {};
  return [
    address.houseDetails,
    address.street,
    address.locality,
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean).join(', ');
};

const badgeColor = (status: string) => {
  if (['PAID', 'DELIVERED', 'PLACED'].includes(status)) return 'green';
  if (['PENDING', 'PACKED', 'PICKED', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(status)) return 'yellow';
  // Return-to-origin: the shipment is coming back (RTO) / arrived back (RTO_DELIVERED).
  if (status?.startsWith('RTO')) return 'orange';
  if (['CANCELLED', 'FAILED', 'REFUNDED'].includes(status)) return 'red';
  return 'gray';
};

// ─── Live status from the carrier (Delhivery) ────────────────────────────────
// Status is driven purely by the carrier: for every order that has an AWB we
// bulk-fetch its current status from the track API (one request per 50 waybills)
// and show that instead of any locally-stored status.
const liveStatus = ref<Record<string, {
  status: string | null;
  rawStatus: string | null;
  statusType?: string | null;
  nslCode?: string | null;
  instructions?: string | null;
  ndrAttempts?: number;
}>>({});

const orderAwb = (order: any) => order?.meta?.shipping?.awb || order?.meta?.shipping?.trackingId || null;

// What the table shows: carrier status when we have it, else the stored status.
const displayStatus = (order: any) => {
  const awb = orderAwb(order);
  return (awb && liveStatus.value[awb]?.status) || order.status;
};
const rawStatus = (order: any) => {
  const awb = orderAwb(order);
  return awb ? (liveStatus.value[awb]?.rawStatus || null) : null;
};

async function refreshLiveStatuses() {
  const awbs = [...new Set((orders.value || []).map(orderAwb).filter(Boolean))] as string[];
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
  } catch {
    /* leave stored status as the fallback */
  }
}

// Re-pull carrier status whenever the order set changes (initial load + refetch).
watch(orders, () => refreshLiveStatuses(), { immediate: true });

// ─── NDR (failed delivery / cancelled pickup) ────────────────────────────────
// Detected live from the track API: the Status.StatusCode (NSL code) tells us
// whether the shipment is actionable. StatusType 'UD' alone is NOT an NDR
// signal (a freshly manifested shipment is also 'UD') — only these NSL codes:
//   RE-ATTEMPT        — failed delivery attempt
//   PICKUP_RESCHEDULE — cancelled (non-OTP) shipment
// Both require attempt count 1-2 and are best applied after 9 PM. The NDR API
// is async: it returns a UPL ID which we persist on the order and poll.
const REATTEMPT_NSL = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
const RESCHEDULE_NSL = ['EOD-777', 'EOD-21'];

const ndrInfo = (row: any) => {
  const awb = orderAwb(row);
  const live = awb ? liveStatus.value[awb] : null;
  const nsl = (live?.nslCode || '').toUpperCase();
  if (!nsl) return null;
  const action = REATTEMPT_NSL.includes(nsl) ? 'RE-ATTEMPT'
    : RESCHEDULE_NSL.includes(nsl) ? 'PICKUP_RESCHEDULE' : null;
  if (!action) return null;
  return {
    awb,
    nsl,
    action,
    label: action === 'RE-ATTEMPT' ? 'Re-attempt delivery' : 'Reschedule pickup',
    reason: live?.instructions || live?.rawStatus || 'Delivery attempt failed',
    attempts: live?.ndrAttempts || 0,
  };
};

const ndrUpl = (row: any) => row?.meta?.shipping?.ndr?.upl || null;

const ndrModalOpen = ref(false);
const ndrRow = ref<any>(null);
const ndrBusy = ref(false);
const ndrTarget = computed(() => (ndrRow.value ? ndrInfo(ndrRow.value) : null));

function openNdr(row: any) {
  ndrRow.value = row;
  ndrModalOpen.value = true;
}

async function submitNdr() {
  const target = ndrTarget.value;
  if (!target?.awb) return;
  ndrBusy.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/ndr', {
      method: 'POST',
      body: { awb: target.awb, action: target.action },
    });
    toast.add({
      title: `NDR action queued (${target.action})`,
      description: res?.uplId ? `Request ID ${res.uplId} — check its status from the order row.` : 'Request submitted to the carrier.',
      color: 'green',
    });
    ndrModalOpen.value = false;
    await refetch(); // pick up the persisted UPL id on the order meta
  } catch (e: any) {
    toast.add({ title: 'NDR action failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    ndrBusy.value = false;
  }
}

// Poll the async NDR request (UPL) status.
const uplModalOpen = ref(false);
const uplLoading = ref(false);
const uplRow = ref<any>(null);
const uplResult = ref<any>(null);

async function checkUplStatus(row: any) {
  const uplId = ndrUpl(row)?.id;
  if (!uplId) return;
  uplRow.value = row;
  uplResult.value = null;
  uplModalOpen.value = true;
  uplLoading.value = true;
  try {
    uplResult.value = await $fetch('/api/ecommerce-cms/shipping/ndr-status', { query: { uplId } });
  } catch (e: any) {
    toast.add({ title: 'Status check failed', description: e.data?.statusMessage || e.message, color: 'red' });
    uplModalOpen.value = false;
  } finally {
    uplLoading.value = false;
  }
}

const shipOpen = ref(false);
const shipOrder = ref<any>(null);
function openShip(order: any) {
  shipOrder.value = order;
  shipOpen.value = true;
}

// ─── Bulk shipment creation ──────────────────────────────────────────────────
const toast = useToast();
const bulkOpen = ref(false);
const bulkLoading = ref(false);
const bulkCreating = ref(false);
const bulkData = ref<any>(null);

async function openBulk() {
  bulkOpen.value = true;
  bulkLoading.value = true;
  bulkData.value = null;
  try {
    bulkData.value = await $fetch('/api/ecommerce-cms/shipping/bulk-preview', { method: 'POST', body: {} });
  } catch (e: any) {
    toast.add({ title: 'Preview failed', description: e.data?.statusMessage || e.message, color: 'red' });
    bulkOpen.value = false;
  } finally {
    bulkLoading.value = false;
  }
}

// After bulk create + label generation, prompt to print the generated labels.
const printPromptOpen = ref(false);
const pendingLabels = ref<string[]>([]);
const labelBusy = ref<string | null>(null);

// Open the label PDFs in one window and print them all at once.
function printLabels(urls: string[]) {
  const valid = urls.filter(Boolean);
  if (!valid.length) { toast.add({ title: 'No labels to print', color: 'orange' }); return; }
  if (valid.length === 1) { window.open(valid[0], '_blank'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast.add({ title: 'Allow pop-ups to print labels', color: 'orange' }); return; }
  const frames = valid.map((u) =>
    `<iframe src="${u}" style="width:100%;height:100vh;border:0;page-break-after:always"></iframe>`).join('');
  w.document.write(
    `<!doctype html><html><head><title>Shipping labels</title></head>` +
    `<body style="margin:0">${frames}` +
    `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},1500)}<\/script>` +
    `</body></html>`,
  );
  w.document.close();
}

async function runBulkCreate() {
  bulkCreating.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/bulk-create', { method: 'POST', body: {} });
    toast.add({
      title: `Created ${res.created} shipment(s)`,
      description: res.failed ? `${res.failed} could not be created` : undefined,
      color: res.created ? 'green' : 'orange',
    });
    bulkOpen.value = false;
    await refetch();
    // Labels were generated (not printed) — offer to print them now.
    pendingLabels.value = (res.labels || []).map((l: any) => l.labelUrl).filter(Boolean);
    if (pendingLabels.value.length) printPromptOpen.value = true;
  } catch (e: any) {
    toast.add({ title: 'Bulk create failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    bulkCreating.value = false;
  }
}

// Per-row: generate (if needed) + print a single label.
async function generateAndPrintLabel(row: any) {
  const awb = shipInfo(row)?.awb || row?.meta?.awb;
  if (!awb) { toast.add({ title: 'Create the shipment first', color: 'orange' }); return; }
  labelBusy.value = row.id;
  try {
    let url = shipInfo(row)?.labelUrl;
    if (!url) {
      const res: any = await $fetch('/api/ecommerce-cms/shipping/label', { query: { trackingId: awb } });
      url = res?.labelUrl;
    }
    if (url) { printLabels([url]); await refetch(); }
    else toast.add({ title: 'Label not available yet', color: 'orange' });
  } catch (e: any) {
    toast.add({ title: 'Label failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    labelBusy.value = null;
  }
}

const filteredOrders = computed(() => {
  const query = search.value.trim().toLowerCase();
  return (orders.value || []).filter((order: any) => {
    const matchesStatus = statusFilter.value === 'All' || displayStatus(order) === statusFilter.value;
    const matchesPayment = paymentFilter.value === 'All' || order.paymentStatus === paymentFilter.value;
    const searchable = [
      order.orderNumber,
      order.client?.name,
      order.client?.phone,
      order.client?.email,
      order.bill?.invoiceNumber,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    return matchesStatus && matchesPayment && matchesSearch;
  });
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Orders</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ecommerce orders placed from the custom storefront.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-heroicons-cube" color="primary" @click="openBulk">
          Create Shipments
        </UButton>
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
          :loading="isLoading"
          @click="() => refetch()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <UCard>
      <div class="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search order, customer, phone, invoice"
        />
        <USelect v-model="statusFilter" :options="statusOptions" />
        <USelect v-model="paymentFilter" :options="paymentOptions" />
      </div>

      <UTable :rows="filteredOrders" :columns="columns" :loading="isLoading">
        <template #order-data="{ row }">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ orderLabel(row) }}</p>
            <p v-if="row.bill?.invoiceNumber" class="text-xs text-gray-500">
              Bill #{{ row.bill.invoiceNumber }}
            </p>
          </div>
        </template>

        <template #createdAt-data="{ row }">
          <span class="text-sm text-gray-600 dark:text-gray-300">
            {{ format(new Date(row.createdAt), 'dd MMM yyyy, hh:mm a') }}
          </span>
        </template>

        <template #shipment-data="{ row }">
          <div v-if="shipInfo(row)" class="text-xs">
            <p class="text-gray-900 dark:text-white">
              {{ shipInfo(row).boxCount || 1 }} box{{ (shipInfo(row).boxCount || 1) === 1 ? '' : 'es' }}
              <span v-if="shipInfo(row).totalWeight != null" class="text-gray-500">· {{ shipInfo(row).totalWeight }} kg</span>
            </p>
            <p v-if="shipInfo(row).boxes?.length" class="text-gray-400 truncate max-w-[140px]">
              {{ shipInfo(row).boxes.join(', ') }}
            </p>
          </div>
          <span v-else class="text-xs text-gray-400">—</span>
        </template>

        <template #customer-data="{ row }">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ row.client?.name || 'Customer' }}</p>
            <p class="text-xs text-gray-500">{{ row.client?.phone || row.client?.email || '-' }}</p>
          </div>
        </template>

        <template #items-data="{ row }">
          <div class="max-w-xs">
            <p class="text-sm text-gray-900 dark:text-white">{{ itemCount(row) }} item{{ itemCount(row) === 1 ? '' : 's' }}</p>
            <p class="truncate text-xs text-gray-500">{{ firstItems(row) || 'No item snapshot' }}</p>
          </div>
        </template>

        <template #payment-data="{ row }">
          <div class="space-y-1">
            <UBadge :color="badgeColor(row.paymentStatus)" variant="subtle">
              {{ row.paymentStatus }}
            </UBadge>
            <p class="text-xs text-gray-500">{{ row.paymentMethod || '-' }}</p>
          </div>
        </template>

        <template #status-data="{ row }">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge :color="badgeColor(displayStatus(row))" variant="subtle" :title="rawStatus(row) || ''">
              {{ displayStatus(row) }}
            </UBadge>
            <UBadge v-if="ndrInfo(row)" color="amber" variant="subtle" size="xs" :title="ndrInfo(row)!.reason">
              NDR · {{ ndrInfo(row)!.nsl }}
            </UBadge>
            <UBadge v-if="ndrUpl(row)" color="blue" variant="subtle" size="xs" :title="`UPL ${ndrUpl(row).id}`">
              {{ ndrUpl(row).action }} queued
            </UBadge>
          </div>
          <p v-if="ndrInfo(row)" class="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400 truncate max-w-[140px]">
            {{ ndrInfo(row)!.reason }}
          </p>
          <p v-else-if="rawStatus(row)" class="mt-0.5 text-[10px] text-gray-400 truncate max-w-[120px]">
            {{ rawStatus(row) }}
          </p>
        </template>

        <template #grandTotal-data="{ row }">
          <span class="font-medium text-gray-900 dark:text-white">{{ money(row.grandTotal) }}</span>
        </template>

        <template #actions-data="{ row }">
          <div class="flex items-center gap-1">
          <UButton
            icon="i-heroicons-truck"
            :color="row.meta?.shipping?.awb ? 'primary' : 'gray'"
            variant="ghost"
            :title="row.meta?.shipping?.awb ? `AWB ${row.meta.shipping.awb}` : 'Create shipment'"
            @click="openShip(row)"
          />
          <UButton
            v-if="row.meta?.shipping?.awb"
            icon="i-heroicons-printer"
            :color="row.meta?.shipping?.labelUrl ? 'primary' : 'gray'"
            variant="ghost"
            :loading="labelBusy === row.id"
            :title="row.meta?.shipping?.labelUrl ? 'Print label' : 'Generate & print label'"
            @click="generateAndPrintLabel(row)"
          />
          <UButton
            v-if="ndrInfo(row)"
            icon="i-heroicons-exclamation-triangle"
            color="amber"
            variant="ghost"
            :title="ndrInfo(row)!.label"
            @click="openNdr(row)"
          />
          <UButton
            v-if="ndrUpl(row)"
            icon="i-heroicons-magnifying-glass"
            color="blue"
            variant="ghost"
            :title="`Check NDR request status (UPL ${ndrUpl(row).id})`"
            @click="checkUplStatus(row)"
          />
          <UPopover>
            <UButton icon="i-heroicons-eye" color="gray" variant="ghost" />
            <template #panel>
              <div class="w-96 max-w-[90vw] space-y-4 p-4">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">Order {{ orderLabel(row) }}</p>
                  <p class="text-xs text-gray-500">Placed {{ format(new Date(row.createdAt), 'dd MMM yyyy, hh:mm a') }}</p>
                </div>
                <div class="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">
                  <p class="font-medium text-gray-900 dark:text-white">Shipping address</p>
                  <p class="mt-1 text-gray-600 dark:text-gray-300">{{ addressLine(row) || 'No address saved' }}</p>
                </div>
                <div>
                  <p class="mb-2 text-sm font-medium text-gray-900 dark:text-white">Items</p>
                  <div class="max-h-56 space-y-2 overflow-y-auto">
                    <div
                      v-for="(item, index) in (Array.isArray(row.items) ? row.items : [])"
                      :key="`${row.id}-${index}`"
                      class="flex justify-between gap-3 rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800"
                    >
                      <div>
                        <p class="font-medium text-gray-900 dark:text-white">{{ item.name || item.variantName || 'Item' }}</p>
                        <p class="text-xs text-gray-500">{{ item.variantName || item.size || '' }}</p>
                      </div>
                      <div class="text-right">
                        <p>Qty {{ item.quantity || item.qty || 1 }}</p>
                        <p class="text-xs text-gray-500">{{ money(item.value || item.dprice || item.sprice) }}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <span class="text-gray-500">Subtotal</span>
                  <span class="text-right">{{ money(row.subtotal) }}</span>
                  <span class="text-gray-500">Discount</span>
                  <span class="text-right">-{{ money(row.discount) }}</span>
                  <span class="text-gray-500">Delivery</span>
                  <span class="text-right">{{ money(row.deliveryFee) }}</span>
                  <span class="font-medium text-gray-900 dark:text-white">Total</span>
                  <span class="text-right font-medium text-gray-900 dark:text-white">{{ money(row.grandTotal) }}</span>
                </div>
              </div>
            </template>
          </UPopover>
          </div>
        </template>

        <template #empty-state>
          <div class="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <UIcon name="i-heroicons-shopping-bag" class="h-10 w-10 text-gray-400" />
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">No ecommerce orders</p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Orders placed from Revomotive will appear here.
              </p>
            </div>
          </div>
        </template>
      </UTable>
    </UCard>

    <ShipOrderModal v-model="shipOpen" :order="shipOrder" @updated="() => { refetch(); }" />

    <!-- Bulk create shipments -->
    <UModal v-model="bulkOpen" :ui="{ width: 'sm:max-w-3xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">Create Shipments</h2>
            <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="bulkOpen = false" />
          </div>
        </template>

        <div v-if="bulkLoading" class="flex items-center justify-center py-12 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
        </div>

        <div v-else-if="bulkData" class="space-y-4">
          <div class="flex flex-wrap gap-4 text-sm">
            <span><strong>{{ bulkData.shippable }}</strong> of {{ bulkData.total }} unshipped orders ready</span>
            <span class="text-gray-500">Pickup: {{ bulkData.pickupLocation || '— none registered' }}</span>
            <span class="text-gray-500">{{ bulkData.boxesConfigured }} box preset(s)</span>
          </div>

          <div v-if="!bulkData.total" class="py-8 text-center text-sm text-gray-500">
            No unshipped orders.
          </div>

          <div v-else class="max-h-96 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-gray-50 dark:bg-gray-900 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th class="p-2">Order</th>
                  <th>Weight</th>
                  <th>Boxes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in bulkData.orders" :key="o.orderId" class="border-t border-gray-100 dark:border-gray-800">
                  <td class="p-2 font-medium text-gray-900 dark:text-white">#{{ o.orderNumber }}</td>
                  <td>{{ o.canShip ? `${o.totalWeight} kg` : '—' }}</td>
                  <td>{{ o.canShip ? (o.boxCount ? `${o.boxCount} (${o.boxes.join(', ')})` : 'single') : '—' }}</td>
                  <td>
                    <UBadge v-if="o.canShip" color="green" variant="subtle" size="xs">Ready</UBadge>
                    <span v-else class="text-xs text-red-500">{{ o.reason || 'Not able to generate shipment' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="bulkOpen = false">Cancel</UButton>
            <UButton
              icon="i-heroicons-truck"
              :loading="bulkCreating"
              :disabled="!bulkData || !bulkData.shippable"
              @click="runBulkCreate"
            >
              Create {{ bulkData?.shippable || 0 }} shipment(s)
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- NDR action (re-attempt / pickup reschedule) -->
    <UModal v-model="ndrModalOpen" :ui="{ width: 'sm:max-w-lg' }">
      <UCard v-if="ndrRow && ndrTarget">
        <template #header>
          <h2 class="text-lg font-semibold">{{ ndrTarget.label }} · {{ orderLabel(ndrRow) }}</h2>
          <p class="text-xs text-gray-500">AWB {{ ndrTarget.awb }} · NSL {{ ndrTarget.nsl }}</p>
        </template>

        <div class="space-y-3">
          <p class="text-sm text-amber-700 dark:text-amber-300 font-medium">{{ ndrTarget.reason }}</p>
          <p class="text-xs text-gray-500">
            Failed attempts so far: <span class="font-medium text-gray-700 dark:text-gray-300">{{ ndrTarget.attempts || '—' }}</span>
          </p>

          <UAlert
            v-if="ndrTarget.attempts > 2"
            color="amber"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle"
            :description="`Attempt count is ${ndrTarget.attempts} — the carrier allows this action only when it is 1 or 2, so it may be rejected.`"
          />

          <UAlert
            color="blue"
            variant="subtle"
            icon="i-heroicons-clock"
            :description="`This queues a ${ndrTarget.action} request with the carrier (processed asynchronously — you get a request ID to track). Best applied after 9 PM, once the day's dispatches are closed.`"
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="ndrModalOpen = false">Cancel</UButton>
            <UButton :loading="ndrBusy" icon="i-heroicons-paper-airplane" @click="submitNdr">
              Queue {{ ndrTarget.action }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- NDR request (UPL) status -->
    <UModal v-model="uplModalOpen" :ui="{ width: 'sm:max-w-lg' }">
      <UCard v-if="uplRow">
        <template #header>
          <h2 class="text-lg font-semibold">NDR request status · {{ orderLabel(uplRow) }}</h2>
          <p class="text-xs text-gray-500">
            {{ ndrUpl(uplRow)?.action }} · UPL {{ ndrUpl(uplRow)?.id }}
            <template v-if="ndrUpl(uplRow)?.at">
              · queued {{ format(new Date(ndrUpl(uplRow).at), 'dd MMM, hh:mm a') }}
            </template>
          </p>
        </template>

        <div v-if="uplLoading" class="flex items-center justify-center py-10 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
        </div>
        <pre v-else class="max-h-80 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-xs text-gray-700 dark:text-gray-300">{{ JSON.stringify(uplResult?.response ?? uplResult, null, 2) }}</pre>

        <template #footer>
          <div class="flex justify-end">
            <UButton variant="ghost" color="gray" @click="uplModalOpen = false">Close</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Print labels prompt (after bulk create + label generation) -->
    <UModal v-model="printPromptOpen" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Print shipping labels?</h2>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ pendingLabels.length }} label(s) were generated for the new shipments. Print them now?
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="printPromptOpen = false">Not now</UButton>
            <UButton icon="i-heroicons-printer" @click="printLabels(pendingLabels); printPromptOpen = false">
              Print {{ pendingLabels.length }} label(s)
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
