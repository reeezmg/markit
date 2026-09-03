<script setup lang="ts">
import { format } from 'date-fns';
import { useFindManyEcommOrder, useCountEcommOrder, useUpdateEcommOrder } from '~/lib/hooks/ecomm-order';

definePageMeta({ auth: true });

const useAuth = () => useNuxtApp().$auth;
const { labelFor } = useSizeLabel();
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

// Labels (print / download / carrier PDF) and shipment cancellation are shared
// with ShipOrderModal — see composables/useShippingLabels.ts and
// composables/useShipmentActions.ts.
const { printLabels, downloadLabels } = useShippingLabels();
const { cancelShipment: cancelShipmentRequest } = useShipmentActions();

// A waybill or order number can arrive in the URL - the NDR screen links back
// here that way, and a bookmarked search should survive a reload.
const route = useRoute();
const search = ref(String(route.query.q || ''));
const statusFilter = ref('All');
const paymentFilter = ref('All');

// One vocabulary for the whole app — see utils/order-status.ts.
const statusOptions = computed(() => [
  { value: 'All', label: 'All' },
  ...ORDER_STATUS_KEYS.map((key) => ({ value: key, label: statusLabel(key) })),
]);
const paymentOptions = ['All', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'];

// ─── Paging + server-side filtering ─────────────────────────────────────────
// Filtering and search run in the DATABASE, not over a loaded slice: with a
// client-side filter over `take: 100`, order 101 and older could never be
// found, filtered or shipped.
const page = ref(1);
// Rows per page is user-selectable, like the sales table.
const pageCount = ref('25');
const pageSize = computed(() => Number(pageCount.value));

// Debounce the search so a query does not fire on every keystroke. Seeded from
// the URL so a link into a specific waybill filters on first paint, not after
// the first keypress.
const searchTerm = ref(search.value.trim());
let searchTimer: any = null;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchTerm.value = value.trim(); }, 300);
});

const where = computed(() => {
  const q = searchTerm.value;
  const filters: any = { companyId: companyId.value };
  if (statusFilter.value !== 'All') filters.status = statusFilter.value;
  if (paymentFilter.value !== 'All') filters.paymentStatus = paymentFilter.value;
  if (q) {
    const asNumber = Number(q);
    filters.OR = [
      ...(Number.isInteger(asNumber) ? [{ orderNumber: asNumber }] : []),
      { client: { is: { name: { contains: q, mode: 'insensitive' } } } },
      { client: { is: { phone: { contains: q } } } },
      { client: { is: { email: { contains: q, mode: 'insensitive' } } } },
      { bill: { is: { invoiceNumber: { contains: q, mode: 'insensitive' } } } },
      // A seller chasing a parcel usually has the waybill in front of them.
      { meta: { path: ['awb'], string_contains: q } },
    ];
  }
  return filters;
});

// Any filter change invalidates the current page number.
watch([() => statusFilter.value, () => paymentFilter.value, searchTerm, pageCount], () => { page.value = 1; });

const { data: orders, isLoading, refetch } = useFindManyEcommOrder(
  computed(() => ({
    where: where.value,
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
    skip: (page.value - 1) * pageSize.value,
    take: pageSize.value,
  })),
  { enabled: computed(() => Boolean(companyId.value)) },
);

// The real total from the database — not the length of the current page.
const { data: orderTotal, refetch: refetchCount } = useCountEcommOrder(
  computed(() => ({ where: where.value })),
  { enabled: computed(() => Boolean(companyId.value)) },
);
const total = computed(() => Number(orderTotal.value ?? 0));
const pageFrom = computed(() => (total.value ? (page.value - 1) * pageSize.value + 1 : 0));
const pageTo = computed(() => Math.min(page.value * pageSize.value, total.value));

async function reload() {
  await Promise.all([refetch(), refetchCount()]);
}

// Every column has a width so the table fits a laptop screen instead of
// scrolling sideways with the actions menu off the edge. They add up to 86% plus
// a fixed actions column; anything longer than its share truncates with an
// ellipsis and keeps the full text in a tooltip.
const columns = [
  { key: 'order', label: 'Order', class: 'w-[10%]', rowClass: 'align-top whitespace-normal' },
  { key: 'createdAt', label: 'Date', class: 'w-[8%]', rowClass: 'align-top' },
  { key: 'customer', label: 'Customer', class: 'w-[15%]', rowClass: 'align-top whitespace-normal' },
  { key: 'items', label: 'Items', class: 'w-[12%]', rowClass: 'align-top whitespace-normal' },
  { key: 'payment', label: 'Payment', class: 'w-[10%]', rowClass: 'align-top' },
  { key: 'status', label: 'Status', class: 'w-[22%]', rowClass: 'align-top whitespace-normal' },
  { key: 'grandTotal', label: 'Total', class: 'w-[9%] text-right', rowClass: 'align-top text-right' },
  { key: 'actions', label: 'Actions', class: 'w-[104px] text-right', rowClass: 'align-top' },
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

// Payment status only — shipment status is coloured from utils/order-status.ts.
const paymentColor = (status: string) => {
  if (status === 'PAID') return 'green';
  if (status === 'PENDING') return 'yellow';
  if (status === 'FAILED') return 'red';
  if (status === 'REFUNDED') return 'orange';
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

// What the Status badge renders.
//
// Delhivery does not publish its full status vocabulary, so the adapter can meet
// a word it cannot map. When that happens we must NOT fall back to the stored
// status — showing "Placed" for a parcel already in transit is worse than
// showing a word we don't recognise. So an unmapped carrier status is shown
// verbatim, in grey, and flagged as unrecognised.
const statusBadge = (order: any) => {
  const awb = orderAwb(order);
  const live = awb ? liveStatus.value[awb] : null;
  if (live?.status) {
    return { text: statusLabel(live.status), color: statusColor(live.status), hint: statusHint(live.status), mapped: true };
  }
  if (live?.rawStatus) {
    return {
      text: live.rawStatus,
      color: 'gray',
      hint: `Unrecognised carrier status — shown exactly as the carrier sent it. The order's own status is still ${statusLabel(order.status)}.`,
      mapped: false,
    };
  }
  return { text: statusLabel(order.status), color: statusColor(order.status), hint: statusHint(order.status), mapped: true };
};

// The carrier's own wording, kept under the badge so nothing is lost in
// translation. Hidden when the badge already shows it.
const carrierStatus = (order: any) => {
  const awb = orderAwb(order);
  const raw = awb ? liveStatus.value[awb]?.rawStatus : null;
  if (!raw) return null;
  const badge = statusBadge(order);
  if (!badge.mapped) return null;                    // the badge IS the raw text
  return raw.trim().toLowerCase() === badge.text.toLowerCase() ? null : raw;
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
const ndrInfo = (row: any) => {
  const awb = orderAwb(row);
  const live = awb ? liveStatus.value[awb] : null;
  if (!isNdrException(live)) return null;
  // The carrier's rules (which NSL codes map to which action, and the 1-2
  // attempt window) live in utils/ndr.ts - the returns, exchange and NDR
  // screens read the same ones.
  return { awb, ...ndrVerdict(live) };
};

const ndrUpl = (row: any) => row?.meta?.shipping?.ndr?.upl || null;

// ─── Row actions (kebab menu) ────────────────────────────────────────────────
const detailsOpen = ref(false);
const detailsRow = ref<any>(null);
function openDetails(row: any) {
  detailsRow.value = row;
  detailsOpen.value = true;
}

// Pack / Ship from the details modal.
// Pack is a purely local step (the carrier knows nothing yet); Ship hands over
// to the shipping modal, which owns the preview + create flow.
const { mutate: updateOrder } = useUpdateEcommOrder();
const packing = ref(false);

// Packing only applies before the parcel exists at the carrier.
const canPack = (row: any) => !!row && !orderAwb(row) && row.status === 'PLACED';
const canShip = (row: any) => !!row && !orderAwb(row);

function markPacked(row: any) {
  if (!canPack(row)) return;
  packing.value = true;
  updateOrder(
    { where: { id: row.id }, data: { status: 'PACKED' } },
    {
      onSuccess: async () => {
        // Keep the open modal in step with the refetched row.
        if (detailsRow.value?.id === row.id) detailsRow.value = { ...detailsRow.value, status: 'PACKED' };
        toast.add({ title: `Order ${orderLabel(row)} marked packed`, color: 'green' });
        await reload();
      },
      onError: (e: any) => toast.add({ title: 'Could not mark packed', description: e.message, color: 'red' }),
      onSettled: () => { packing.value = false; },
    },
  );
}

function shipFromDetails(row: any) {
  detailsOpen.value = false;
  openShip(row);
}

// Pull this one shipment's live carrier status and fold it into liveStatus so
// the Status column updates in place.
const trackBusy = ref<string | null>(null);
async function trackRow(row: any) {
  const awb = orderAwb(row);
  if (!awb) return;
  trackBusy.value = row.id;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/track', { query: { trackingId: awb } });
    await refreshLiveStatuses();
    toast.add({
      title: `AWB ${awb}`,
      description: res?.status || res?.rawStatus || 'No status returned by the carrier',
      color: 'green',
    });
  } catch (e: any) {
    toast.add({ title: 'Track failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally {
    trackBusy.value = null;
  }
}

async function cancelShipment(row: any) {
  const awb = orderAwb(row);
  if (!awb) return;
  if (await cancelShipmentRequest(awb, row.id, orderLabel(row))) await reload();
}

// ─── Cancel order ────────────────────────────────────────────────────────────
// Deliberately NOT the same action as "Cancel shipment" above. That one only
// releases the waybill and puts the order back to Packed so it can ship again.
// This one ends the order: the server releases the waybill too (if there is
// one), puts the stock back, voids the bill and returns any coupon it spent.
// Because it moves stock, it asks for a reason and shows exactly what it did.
const cancelOpen = ref(false);
const cancelRow = ref<any>(null);
const cancelReason = ref('');
const cancelBusy = ref(false);
// Set when the carrier refused to release the waybill. The second confirm
// cancels the order anyway and leaves the seller to sort the parcel out.
const cancelCarrierWarning = ref<string | null>(null);

const isCancelled = (row: any) => row?.status === 'CANCELLED';

function openCancelOrder(row: any) {
  cancelRow.value = row;
  cancelReason.value = '';
  cancelCarrierWarning.value = null;
  cancelOpen.value = true;
}

async function confirmCancelOrder() {
  const row = cancelRow.value;
  if (!row) return;
  cancelBusy.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/orders/cancel', {
      method: 'POST',
      body: {
        orderId: row.id,
        reason: cancelReason.value,
        // Only ever true on the second attempt, after the seller has read why
        // the carrier said no.
        ignoreCarrierError: Boolean(cancelCarrierWarning.value),
      },
    });
    // Say what actually moved. "Cancelled" alone leaves the seller wondering
    // whether the stock came back.
    const units = res.restored.reduce((sum: number, r: any) => sum + r.quantity, 0);
    const parts = [
      units ? `${units} unit(s) returned to stock` : 'no stock to return',
      res.shipmentCancelled ? 'waybill released' : null,
      res.billCancelled ? 'bill voided' : null,
      res.couponsReversed ? `${res.couponsReversed} coupon(s) returned` : null,
    ].filter(Boolean);
    toast.add({
      title: `Order ${orderLabel(row)} cancelled`,
      description: parts.join(' · '),
      color: 'green',
      timeout: 8000,
    });
    // Stock rows that no longer exist can't be credited back — the seller needs
    // to know that number rather than discover it in a stock count.
    if (res.unrestorable) {
      toast.add({
        title: `${res.unrestorable} line(s) could not be restored`,
        description: 'Their stock rows no longer exist. Adjust those products by hand if needed.',
        color: 'orange',
        timeout: 0,
      });
    }
    cancelOpen.value = false;
    if (detailsRow.value?.id === row.id) detailsOpen.value = false;
    await reload();
  } catch (e: any) {
    // 409 means the carrier refused: keep the modal open and let the seller
    // decide, rather than burying it in a toast that closes the flow.
    if (e?.statusCode === 409) {
      cancelCarrierWarning.value = e.data?.data?.carrierError || carrierError(e);
    } else {
      toast.add({
        title: 'Could not cancel the order',
        description: carrierError(e),
        color: 'red',
        timeout: 0,
        ui: { description: 'whitespace-pre-line' },
      });
    }
  } finally {
    cancelBusy.value = false;
  }
}

// ─── Manual status update ────────────────────────────────────────────────────
// Status is normally the carrier's word, not ours - see the Status column. This
// is the override for what the carrier cannot describe: a parcel handed over in
// person, an order collected from the shop, a webhook that never arrived. It is
// recorded on the timeline as a manual change so it never looks like carrier data.
const manualOpen = ref(false);
const manualRow = ref<any>(null);
const manualStatus = ref('');
const manualNote = ref('');
const manualBusy = ref(false);

// Every status in the vocabulary, including the reverse-pickup ones the filter
// list leaves out - a manual correction is exactly when they are needed.
const manualStatusOptions = Object.keys(ORDER_STATUS).map((key) => ({
  value: key,
  label: statusLabel(key),
}));

const manualIsCancel = computed(() => manualStatus.value === 'CANCELLED');

function openManualStatus(row: any) {
  manualRow.value = row;
  manualStatus.value = row.status || 'PLACED';
  manualNote.value = '';
  manualOpen.value = true;
}

async function saveManualStatus() {
  const row = manualRow.value;
  if (!row || !manualStatus.value) return;

  // Cancelling is a rollback, not a status write, and it also has to release
  // the waybill - so hand it to the cancel flow rather than duplicating it.
  if (manualIsCancel.value) {
    manualOpen.value = false;
    openCancelOrder(row);
    cancelReason.value = manualNote.value;
    return;
  }

  manualBusy.value = true;
  try {
    await $fetch('/api/ecommerce-cms/orders/status', {
      method: 'POST',
      body: { orderId: row.id, status: manualStatus.value, note: manualNote.value },
    });
    toast.add({
      title: `Order ${orderLabel(row)} set to ${statusLabel(manualStatus.value)}`,
      description: 'Recorded on the timeline as a manual change.',
      color: 'green',
    });
    manualOpen.value = false;
    if (detailsRow.value?.id === row.id) {
      detailsRow.value = { ...detailsRow.value, status: manualStatus.value };
    }
    await reload();
  } catch (e: any) {
    toast.add({
      title: 'Could not update the status',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    manualBusy.value = false;
  }
}

// Hold a parcel back from pickups, or put it back in. Stored on the order so the
// choice persists and the pickup screen sees it — not a per-session toggle.
const pickupExcluded = (row: any) => Boolean(row?.meta?.shipping?.pickupExcluded);
const pickupBusy = ref<string | null>(null);

async function togglePickup(row: any) {
  const excluded = !pickupExcluded(row);
  pickupBusy.value = row.id;
  try {
    await $fetch('/api/ecommerce-cms/pickup/exclude', {
      method: 'POST', body: { orderId: row.id, excluded },
    });
    toast.add({
      title: excluded
        ? `Order ${orderLabel(row)} held back from pickup`
        : `Order ${orderLabel(row)} included in pickup`,
      description: excluded
        ? 'It stays out of pickup requests until you include it again.'
        : undefined,
      icon: excluded ? 'i-heroicons-pause-circle' : 'i-heroicons-check-circle',
      color: excluded ? 'amber' : 'green',
    });
    await reload();
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally {
    pickupBusy.value = null;
  }
}

// ─── Per-row label actions ───────────────────────────────────────────────────
// Print and Download both render Markit's own label from the carrier's label
// data - shared with the ship modal, which is also where the carrier's own PDF
// stayed for the rare case someone needs their exact document.
function labelAwb(row: any): string | null {
  const awb = orderAwb(row);
  if (!awb) toast.add({ title: 'Create the shipment first', color: 'orange' });
  return awb;
}

function printRowLabel(row: any) {
  const awb = labelAwb(row);
  if (awb) printLabels([awb]);
}

function downloadRowLabel(row: any) {
  const awb = labelAwb(row);
  if (awb) downloadLabels([awb], `label-order-${row.orderNumber ?? ''}-${awb}.pdf`);
}

// Everything except "Create shipment" lives in one menu — the column carried
// six icons before and most of them only applied to some rows.
function rowActions(row: any) {
  const awb = orderAwb(row);
  const ndr = ndrInfo(row);
  const upl = ndrUpl(row);

  const label = awb ? [
    { label: 'Print label', icon: 'i-heroicons-printer-20-solid', click: () => printRowLabel(row) },
    { label: 'Download PDF', icon: 'i-heroicons-arrow-down-tray-20-solid', click: () => downloadRowLabel(row) },
    { label: 'Track shipment', icon: 'i-heroicons-magnifying-glass-20-solid', click: () => trackRow(row) },
    // The edit form lives inside the shipping modal.
    { label: 'Edit shipment', icon: 'i-heroicons-pencil-square-20-solid', click: () => openShip(row) },
    {
      label: pickupExcluded(row) ? 'Include in pickup' : 'Hold back from pickup',
      icon: pickupExcluded(row) ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-pause-circle-20-solid',
      click: () => togglePickup(row),
    },
  ] : [];

  // Failed deliveries are worked in one place - /order/ndr - where the three
  // buckets and the carrier's rules live. The row only points at it.
  const ndrItems = ndr || upl
    ? [{
        label: upl ? `${upl.action} request status` : ndr!.label,
        icon: 'i-heroicons-exclamation-triangle-20-solid',
        click: () => navigateTo(`/order/ndr?q=${encodeURIComponent(awb || '')}`),
      }]
    : [];

  const general = [
    { label: 'View details', icon: 'i-heroicons-eye-20-solid', click: () => openDetails(row) },
    // The manual override for what the carrier cannot tell us. Pointless once
    // the order is cancelled — that status is the end of the line.
    ...(isCancelled(row)
      ? []
      : [{
          label: 'Update status',
          icon: 'i-heroicons-arrow-path-rounded-square-20-solid',
          click: () => openManualStatus(row),
        }]),
  ];

  // Two different endings, kept apart on purpose:
  //   Cancel shipment — releases the waybill, order goes back to Packed to ship again
  //   Cancel order    — ends the order, releases the waybill too, stock comes back
  const danger = [
    ...(awb
      ? [{ label: 'Cancel shipment', icon: 'i-heroicons-x-circle-20-solid', click: () => cancelShipment(row) }]
      : []),
    ...(isCancelled(row)
      ? []
      : [{ label: 'Cancel order', icon: 'i-heroicons-no-symbol-20-solid', click: () => openCancelOrder(row) }]),
  ];

  return [label, ndrItems, general, danger].filter((group) => group.length);
}

const shipOpen = ref(false);
const shipOrder = ref<any>(null);
function openShip(order: any) {
  shipOrder.value = order;
  shipOpen.value = true;
}

// ─── Bulk shipment creation ──────────────────────────────────────────────────
const bulkOpen = ref(false);
const bulkLoading = ref(false);
const bulkCreating = ref(false);
const bulkData = ref<any>(null);

// Which orders the bulk run will actually ship. Creating a shipment spends a
// real waybill, so this is an explicit choice — every shippable order starts
// ticked, but any of them can be left out.
const bulkSelected = ref<string[]>([]);
const bulkShippable = computed(() => (bulkData.value?.orders || []).filter((o: any) => o.canShip));
const bulkAllSelected = computed({
  get: () => bulkShippable.value.length > 0 && bulkSelected.value.length === bulkShippable.value.length,
  set: (on: boolean) => { bulkSelected.value = on ? bulkShippable.value.map((o: any) => o.orderId) : []; },
});

async function openBulk() {
  bulkOpen.value = true;
  bulkLoading.value = true;
  bulkData.value = null;
  bulkSelected.value = [];
  try {
    bulkData.value = await $fetch('/api/ecommerce-cms/shipping/bulk-preview', { method: 'POST', body: {} });
    bulkSelected.value = bulkShippable.value.map((o: any) => o.orderId);
  } catch (e: any) {
    toast.add({ title: 'Preview failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
    bulkOpen.value = false;
  } finally {
    bulkLoading.value = false;
  }
}

// After bulk create + label generation, prompt to print the generated labels.
const printPromptOpen = ref(false);
const pendingLabels = ref<string[]>([]);   // AWBs of freshly generated labels

// Download the batch bulk-create just generated. Same document the Print
// button beside it produces - one PDF, one page per label.
function downloadPendingLabels() {
  downloadLabels(pendingLabels.value, `shipping-labels-${pendingLabels.value.length}.pdf`);
  printPromptOpen.value = false;
}

async function runBulkCreate() {
  bulkCreating.value = true;
  try {
    // Ship only what is ticked — never everything by default.
    const res: any = await $fetch('/api/ecommerce-cms/shipping/bulk-create', {
      method: 'POST', body: { orderIds: bulkSelected.value },
    });
    // Name the orders that failed and why — a bare count leaves the seller with
    // nothing to act on.
    const failures = (res.results || [])
      .filter((r: any) => !r.ok)
      .map((r: any) => `• #${r.orderNumber ?? r.orderId?.slice(0, 8)} — ${carrierMessage(r.error) || 'unknown error'}`);
    toast.add({
      title: `Created ${res.created} shipment(s)`,
      description: failures.length ? `${res.failed} failed:\n${failures.join('\n')}` : undefined,
      color: res.created ? 'green' : 'orange',
      timeout: failures.length ? 0 : 5000,
      ui: { description: 'whitespace-pre-line' },
    });
    bulkOpen.value = false;
    await reload();
    // Labels were generated (not printed) — offer to print them now.
    pendingLabels.value = (res.labels || []).map((l: any) => l.awb).filter(Boolean);
    if (pendingLabels.value.length) printPromptOpen.value = true;
  } catch (e: any) {
    toast.add({ title: 'Bulk create failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
  } finally {
    bulkCreating.value = false;
  }
}

// The query already applied the filters and the page window, so the table just
// renders what came back.
const rows = computed(() => orders.value || []);
</script>

<template>
  <UDashboardPanelContent class="space-y-6 pb-24">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Orders</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ecommerce orders placed from the custom storefront.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Orders that did not come through the storefront - phone, WhatsApp,
             or the counter - are created here and then behave identically. -->
        <UButton icon="i-heroicons-plus" color="gray" variant="soft" to="/order/create">
          New order
        </UButton>
        <UButton icon="i-heroicons-cube" color="primary" @click="openBulk">
          Create Shipments
        </UButton>
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
          :loading="isLoading"
          @click="() => reload()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <UCard
      class="w-full"
      :ui="{
        base: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: {
          padding: '',
          base: 'divide-y divide-gray-200 dark:divide-gray-700',
        },
        footer: { padding: 'p-4' },
      }"
    >
      <template #header>
        <div class="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search order, customer, phone, invoice"
          />
          <USelect v-model="statusFilter" :options="statusOptions" />
          <USelect v-model="paymentFilter" :options="paymentOptions" />
        </div>
      </template>

      <div class="flex items-center gap-1.5 px-4 py-3">
        <span class="hidden text-sm leading-5 sm:block">Rows per page:</span>
        <USelect
          v-model="pageCount"
          :options="[10, 25, 50, 100].map((num) => ({ label: num, value: num }))"
          class="me-2 w-20"
          size="xs"
        />
      </div>

      <UTable
        :rows="rows"
        :columns="columns"
        :loading="isLoading"
        :ui="{ th: { padding: 'px-3 py-2.5' }, td: { padding: 'px-3 py-3', base: 'align-top' } }"
      >
        <template #order-data="{ row }">
          <div class="min-w-0">
            <p class="truncate font-medium text-gray-900 dark:text-white">{{ orderLabel(row) }}</p>
            <p v-if="row.bill?.invoiceNumber" class="truncate text-xs text-gray-400">
              Bill #{{ row.bill.invoiceNumber }}
            </p>
          </div>
        </template>

        <template #createdAt-data="{ row }">
          <div class="text-xs leading-tight">
            <p class="text-gray-900 dark:text-white">{{ format(new Date(row.createdAt), 'dd/MM/yy') }}</p>
            <p class="text-gray-500">{{ format(new Date(row.createdAt), 'HH:mm') }}</p>
          </div>
        </template>

        <template #customer-data="{ row }">
          <div class="min-w-0">
            <p class="truncate font-medium text-gray-900 dark:text-white" :title="row.client?.name">
              {{ row.client?.name || 'Customer' }}
            </p>
            <p class="truncate text-xs text-gray-500">{{ row.client?.phone || row.client?.email || '-' }}</p>
          </div>
        </template>

        <template #items-data="{ row }">
          <div class="min-w-0">
            <p class="truncate text-sm text-gray-900 dark:text-white">{{ itemCount(row) }} item{{ itemCount(row) === 1 ? '' : 's' }}</p>
            <p class="truncate text-xs text-gray-500" :title="firstItems(row)">
              {{ firstItems(row) || 'No item snapshot' }}
            </p>
            <!-- Box dimensions moved to the tooltip when this folded into the
                 items cell; they are detail, not something read at a glance. -->
            <p
              v-if="shipInfo(row)"
              class="truncate text-xs text-gray-400"
              :title="shipInfo(row).boxes?.length ? `Boxes: ${shipInfo(row).boxes.join(', ')}` : undefined"
            >
              {{ shipInfo(row).boxCount || 1 }} box{{ (shipInfo(row).boxCount || 1) === 1 ? '' : 'es' }}
              <span v-if="shipInfo(row).totalWeight != null">· {{ shipInfo(row).totalWeight }} kg</span>
            </p>
          </div>
        </template>

        <template #payment-data="{ row }">
          <div class="space-y-1">
            <UBadge :color="paymentColor(row.paymentStatus)" variant="subtle">
              {{ row.paymentStatus }}
            </UBadge>
            <p class="truncate text-xs text-gray-500" :title="row.paymentMethod">{{ row.paymentMethod || '-' }}</p>
          </div>
        </template>

        <template #status-data="{ row }">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge
              :color="statusBadge(row).color"
              variant="subtle"
              :title="statusBadge(row).hint"
            >
              {{ statusBadge(row).text }}
              <UIcon v-if="!statusBadge(row).mapped" name="i-heroicons-question-mark-circle" class="ml-0.5" />
            </UBadge>
            <UBadge
              v-if="ndrInfo(row)"
              :color="ndrInfo(row)!.known ? 'amber' : 'orange'"
              variant="subtle"
              size="xs"
              :title="ndrInfo(row)!.reason"
            >
              {{ ndrInfo(row)!.known ? 'NDR' : 'Issue' }} · {{ ndrInfo(row)!.nsl || ndrInfo(row)!.rawStatus }}
            </UBadge>
            <UBadge
              v-if="pickupExcluded(row)"
              color="amber"
              variant="subtle"
              size="xs"
              title="Held back from pickup requests"
            >
              Held back
            </UBadge>
            <UBadge v-if="ndrUpl(row)" color="blue" variant="subtle" size="xs" :title="`UPL ${ndrUpl(row).id}`">
              {{ ndrUpl(row).action }} queued
            </UBadge>
          </div>
          <p v-if="ndrInfo(row)" class="mt-0.5 truncate text-[10px] text-amber-600 dark:text-amber-400">
            {{ ndrInfo(row)!.reason }}
          </p>
          <p
            v-else-if="carrierStatus(row)"
            class="mt-0.5 truncate text-[10px] text-gray-400"
            :title="`Carrier status: ${carrierStatus(row)}`"
          >
            {{ carrierStatus(row) }}
          </p>
        </template>

        <template #grandTotal-data="{ row }">
          <span class="font-medium text-gray-900 dark:text-white">{{ money(row.grandTotal) }}</span>
        </template>

        <template #actions-data="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              icon="i-heroicons-truck"
              :color="orderAwb(row) ? 'primary' : 'gray'"
              variant="ghost"
              :title="orderAwb(row) ? `AWB ${orderAwb(row)}` : 'Create shipment'"
              @click="openShip(row)"
            />
            <UDropdown :items="rowActions(row)" :popper="{ placement: 'bottom-end' }">
              <UButton
                icon="i-heroicons-ellipsis-vertical-20-solid"
                color="gray"
                variant="ghost"
                :loading="trackBusy === row.id"
                title="More actions"
              />
            </UDropdown>
          </div>
        </template>

        <template #empty-state>
          <div class="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <UIcon name="i-heroicons-shopping-bag" class="h-10 w-10 text-gray-400" />
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                {{ searchTerm || statusFilter !== 'All' || paymentFilter !== 'All'
                   ? 'No orders match these filters' : 'No ecommerce orders' }}
              </p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ searchTerm || statusFilter !== 'All' || paymentFilter !== 'All'
                   ? 'Try clearing the search or filters.'
                   : 'Orders placed from Revomotive will appear here.' }}
              </p>
            </div>
          </div>
        </template>
      </UTable>

      <!-- Paging: the count comes from the database, not the loaded page -->
      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm leading-5 text-gray-500">
            Showing <span class="font-medium text-gray-700 dark:text-gray-300">{{ pageFrom }}</span>–<span
              class="font-medium text-gray-700 dark:text-gray-300">{{ pageTo }}</span>
            of <span class="font-medium text-gray-700 dark:text-gray-300">{{ total }}</span> orders
          </span>
          <UPagination
            v-model="page"
            :page-count="pageSize"
            :total="total"
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
              default: { activeButton: { variant: 'outline' } },
            }"
          />
        </div>
      </template>
    </UCard>

    <ShipOrderModal v-model="shipOpen" :order="shipOrder" @updated="() => { reload(); }" />

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
            <span><strong>{{ bulkSelected.length }}</strong> selected · {{ bulkData.shippable }} of {{ bulkData.total }} unshipped orders ready</span>
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
                  <th class="p-2 w-8"><UCheckbox v-model="bulkAllSelected" :disabled="!bulkShippable.length" /></th>
                  <th class="p-2">Order</th>
                  <th>Weight</th>
                  <th>Boxes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in bulkData.orders" :key="o.orderId" class="border-t border-gray-100 dark:border-gray-800">
                  <td class="p-2">
                    <UCheckbox v-model="bulkSelected" :value="o.orderId" :disabled="!o.canShip" />
                  </td>
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
              :disabled="!bulkSelected.length"
              @click="runBulkCreate"
            >
              Create {{ bulkSelected.length }} shipment(s)
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Order details (opened from the row actions menu) -->
    <UModal v-model="detailsOpen" :ui="{ width: 'sm:max-w-2xl' }">
      <UCard v-if="detailsRow">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-lg font-semibold">Order {{ orderLabel(detailsRow) }}</h2>
              <p class="text-xs text-gray-500">
                Placed {{ format(new Date(detailsRow.createdAt), 'dd MMM yyyy, hh:mm a') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="statusBadge(detailsRow).color"
                variant="subtle"
                :title="statusBadge(detailsRow).hint"
              >
                {{ statusBadge(detailsRow).text }}
              </UBadge>
              <UBadge :color="paymentColor(detailsRow.paymentStatus)" variant="subtle">
                {{ detailsRow.paymentStatus }}
              </UBadge>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Shipment -->
          <div v-if="orderAwb(detailsRow)" class="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">
            <p class="font-medium text-gray-900 dark:text-white">Shipment</p>
            <p class="mt-1 text-gray-600 dark:text-gray-300">
              AWB {{ orderAwb(detailsRow) }}
              <span v-if="detailsRow.meta?.shipping?.provider"> · {{ detailsRow.meta.shipping.provider }}</span>
              <span v-if="detailsRow.meta?.shipping?.boxCount"> · {{ detailsRow.meta.shipping.boxCount }} box(es)</span>
            </p>
            <p v-if="carrierStatus(detailsRow)" class="text-xs text-gray-500">
              Carrier status: {{ carrierStatus(detailsRow) }}
            </p>
          </div>

          <!-- Customer -->
          <div class="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">
            <p class="font-medium text-gray-900 dark:text-white">Deliver to</p>
            <p class="mt-1 text-gray-900 dark:text-white">
              {{ [detailsRow.shippingAddress?.firstName, detailsRow.shippingAddress?.lastName].filter(Boolean).join(' ')
                 || detailsRow.client?.name || '—' }}
            </p>
            <p class="text-gray-500">
              {{ detailsRow.shippingAddress?.phoneNo || detailsRow.client?.phone || '—' }}
            </p>
            <p class="mt-1 text-gray-600 dark:text-gray-300">{{ addressLine(detailsRow) || 'No address saved' }}</p>
          </div>

          <!-- Items -->
          <div>
            <p class="mb-2 text-sm font-medium text-gray-900 dark:text-white">
              Items ({{ itemCount(detailsRow) }})
            </p>
            <div class="max-h-56 space-y-2 overflow-y-auto">
              <div
                v-for="(item, index) in (Array.isArray(detailsRow.items) ? detailsRow.items : [])"
                :key="`${detailsRow.id}-${index}`"
                class="flex justify-between gap-3 rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800"
              >
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">{{ item.name || item.variantName || 'Item' }}</p>
                  <p class="text-xs text-gray-500">
                    <span v-if="item.variantName">{{ item.variantName }}</span>
                    <span v-if="item.variantName && item.size"> · </span>
                    <span v-if="item.size">{{ labelFor(item) }}: {{ item.size }}</span>
                  </p>
                </div>
                <div class="text-right">
                  <p>Qty {{ item.quantity || item.qty || 1 }}</p>
                  <p class="text-xs text-gray-500">{{ money(item.value || item.dprice || item.sprice) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Totals -->
          <div class="grid grid-cols-2 gap-2 text-sm">
            <span class="text-gray-500">Subtotal</span>
            <span class="text-right">{{ money(detailsRow.subtotal) }}</span>
            <span class="text-gray-500">Discount</span>
            <span class="text-right">-{{ money(detailsRow.discount) }}</span>
            <span class="text-gray-500">Delivery</span>
            <span class="text-right">{{ money(detailsRow.deliveryFee) }}</span>
            <span class="text-gray-500">Payment</span>
            <span class="text-right">{{ detailsRow.paymentMethod || '—' }}</span>
            <span class="font-medium text-gray-900 dark:text-white">Total</span>
            <span class="text-right font-medium text-gray-900 dark:text-white">{{ money(detailsRow.grandTotal) }}</span>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="detailsOpen = false">Close</UButton>
            <!-- Pack disappears once packed; both disappear once shipped. -->
            <UButton
              v-if="canPack(detailsRow)"
              icon="i-heroicons-archive-box"
              color="gray"
              variant="soft"
              :loading="packing"
              @click="markPacked(detailsRow)"
            >
              Pack
            </UButton>
            <UButton
              v-if="canShip(detailsRow)"
              icon="i-heroicons-truck"
              @click="shipFromDetails(detailsRow)"
            >
              Ship
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Print labels prompt (after bulk create + label generation) -->
    <UModal v-model="printPromptOpen" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Labels ready</h2>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ pendingLabels.length }} label(s) were generated for the new shipments. Print or download them now?
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="printPromptOpen = false">Not now</UButton>
            <UButton
              icon="i-heroicons-arrow-down-tray"
              color="gray"
              variant="soft"
              @click="downloadPendingLabels()"
            >
              Download {{ pendingLabels.length > 1 ? 'ZIP' : 'PDF' }}
            </UButton>
            <UButton icon="i-heroicons-printer" @click="printLabels(pendingLabels); printPromptOpen = false">
              Print {{ pendingLabels.length }} label(s)
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Manual status override -->
    <UModal v-model="manualOpen" :ui="{ width: 'sm:max-w-lg' }">
      <UCard v-if="manualRow">
        <template #header>
          <h2 class="text-lg font-semibold">Update status — order {{ orderLabel(manualRow) }}</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Currently {{ statusLabel(manualRow.status) }}. Status normally comes from the carrier —
            set it by hand only when the carrier cannot tell us.
          </p>
        </template>

        <div class="space-y-4">
          <UFormGroup label="New status" required>
            <USelect v-model="manualStatus" :options="manualStatusOptions" />
            <template #hint>
              <span class="text-xs text-gray-500">{{ statusHint(manualStatus) }}</span>
            </template>
          </UFormGroup>

          <UFormGroup label="Note" hint="Shown on the order timeline">
            <UTextarea
              v-model="manualNote"
              :rows="3"
              placeholder="Why is this being set by hand? e.g. handed to the customer in the shop"
            />
          </UFormGroup>

          <UAlert
            v-if="manualIsCancel"
            icon="i-heroicons-exclamation-triangle"
            color="orange"
            variant="soft"
            title="Cancelling does more than set a status"
            description="It returns the stock, voids the bill and releases the waybill. Continue to see exactly what will happen."
          />
          <UAlert
            v-else
            icon="i-heroicons-information-circle"
            color="blue"
            variant="soft"
            title="This is an override"
            description="It is recorded on the timeline as a manual change, and the carrier's own status still wins in the table while a live waybill reports one."
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" :disabled="manualBusy" @click="manualOpen = false">
              Cancel
            </UButton>
            <UButton
              :color="manualIsCancel ? 'orange' : 'primary'"
              :loading="manualBusy"
              :disabled="!manualStatus"
              @click="saveManualStatus()"
            >
              {{ manualIsCancel ? 'Continue' : 'Update status' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Cancel order (ends the order and returns its stock) -->
    <UModal v-model="cancelOpen" :ui="{ width: 'sm:max-w-lg' }">
      <UCard v-if="cancelRow">
        <template #header>
          <h2 class="text-lg font-semibold text-red-600 dark:text-red-400">
            Cancel order {{ orderLabel(cancelRow) }}?
          </h2>
        </template>

        <div class="space-y-4">
          <div class="text-sm text-gray-600 dark:text-gray-300">
            <p class="mb-2">This ends the order. It will:</p>
            <ul class="list-disc space-y-1 pl-5">
              <li>return {{ itemCount(cancelRow) }} unit(s) to stock</li>
              <li v-if="orderAwb(cancelRow)">release waybill {{ orderAwb(cancelRow) }} at the carrier</li>
              <li>void the linked bill</li>
              <li>give back any coupon the order used</li>
            </ul>
            <p class="mt-3">It cannot be undone — a cancelled order has to be placed again.</p>
          </div>

          <UFormGroup label="Reason" hint="Shown on the order timeline">
            <UTextarea
              v-model="cancelReason"
              :rows="3"
              placeholder="e.g. customer asked to cancel, item damaged in the warehouse"
            />
          </UFormGroup>

          <UAlert
            v-if="cancelCarrierWarning"
            icon="i-heroicons-exclamation-triangle"
            color="red"
            variant="soft"
            title="The carrier refused to cancel the shipment"
            :ui="{ description: 'whitespace-pre-line' }"
            :description="`${cancelCarrierWarning}\n\nThe order has NOT been cancelled. Confirming again cancels it here anyway — the parcel stays live at the carrier and you will have to deal with it separately.`"
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" :disabled="cancelBusy" @click="cancelOpen = false">
              Keep order
            </UButton>
            <UButton color="red" :loading="cancelBusy" @click="confirmCancelOrder()">
              {{ cancelCarrierWarning ? 'Cancel order anyway' : 'Cancel order' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
