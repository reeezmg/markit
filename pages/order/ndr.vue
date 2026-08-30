<script setup lang="ts">
import { format } from 'date-fns';

definePageMeta({ auth: true });

const toast = useToast();

// ─── Data ────────────────────────────────────────────────────────────────────
// The server does the classifying (it is the only place that talks to the
// carrier) — see server/api/ecommerce-cms/shipping/ndr-list.get.ts.
const loading = ref(false);
const data = ref<{ needAction: any[]; inProgress: any[]; returnAdvised: any[]; checked: number }>({
  needAction: [], inProgress: [], returnAdvised: [], checked: 0,
});

// How far back to look. An exception from months ago is not something anyone is
// still resolving, and every extra order is another waybill the carrier is asked
// about.
const windowOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 15 days', value: 15 },
  { label: 'Last 45 days', value: 45 },
  { label: 'Last 90 days', value: 90 },
];
const days = ref(45);

async function load() {
  loading.value = true;
  try {
    data.value = await $fetch('/api/ecommerce-cms/shipping/ndr-list', { query: { days: days.value } });
  } catch (e: any) {
    toast.add({
      title: 'Could not load NDR shipments',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    loading.value = false;
  }
}
watch(days, load);
onMounted(load);

// ─── Tabs ────────────────────────────────────────────────────────────────────
// Need Action  — the carrier will accept an action from us right now
// Auto Reattempt — an action is queued at the carrier, waiting on its outcome
// Return Recommendation — nothing more can be applied; the parcel comes back
const tabs = computed(() => [
  { key: 'needAction', label: 'Need Action', count: data.value.needAction.length },
  { key: 'inProgress', label: 'Auto Reattempt', count: data.value.inProgress.length },
  { key: 'returnAdvised', label: 'Return Recommendation', count: data.value.returnAdvised.length },
]);
const tab = ref(0);
const tabKey = computed(() => tabs.value[tab.value]?.key as 'needAction' | 'inProgress' | 'returnAdvised');

// Switching tabs must drop the selection — the actions differ per tab, and a
// row carried over from another tab may not accept the one being applied.
watch(tab, () => { selected.value = []; });

// ─── Filters ─────────────────────────────────────────────────────────────────
// Seeded from the URL: the orders table links here with the waybill in ?q= so
// the row in question is the one on screen.
const search = ref(String(useRoute().query.q || ''));
const paymentFilter = ref('All');
const attemptFilter = ref('All');
const paymentOptions = ['All', 'COD', 'Prepaid'];
const attemptOptions = ['All', '1', '2', '3+'];

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value[tabKey.value] || []).filter((r: any) => {
    if (paymentFilter.value !== 'All' && r.paymentMode !== paymentFilter.value) return false;
    if (attemptFilter.value !== 'All') {
      const n = Number(r.attempts || 0);
      if (attemptFilter.value === '3+' ? n < 3 : n !== Number(attemptFilter.value)) return false;
    }
    if (!q) return true;
    return [r.awb, r.consignee, r.phone, r.orderNumber, r.products]
      .some((v: any) => String(v ?? '').toLowerCase().includes(q));
  });
});

// ─── Columns ─────────────────────────────────────────────────────────────────
const baseColumns = [
  { key: 'order', label: 'Order ID & AWB no.', class: 'w-[18%]', rowClass: 'align-top whitespace-normal' },
  { key: 'products', label: 'Product details', class: 'w-[20%]', rowClass: 'align-top whitespace-normal' },
];
const ndrColumns = [
  { key: 'ndrType', label: 'NDR type', class: 'w-[22%]', rowClass: 'align-top whitespace-normal' },
  { key: 'attempts', label: 'Attempts', class: 'w-[9%]', rowClass: 'align-top' },
];

const columns = computed(() => {
  if (tabKey.value === 'needAction') {
    return [
      ...baseColumns,
      { key: 'paymentMode', label: 'Payment mode', class: 'w-[10%]', rowClass: 'align-top' },
      ...ndrColumns,
      { key: 'lastUpdated', label: 'Last updated', class: 'w-[11%]', rowClass: 'align-top whitespace-normal' },
      { key: 'actions', label: '', class: 'w-[130px]', rowClass: 'align-top' },
    ];
  }
  return [
    ...baseColumns,
    ...ndrColumns,
    { key: 'resolvedBy', label: 'Resolved by', class: 'w-[14%]', rowClass: 'align-top whitespace-normal' },
    { key: 'status', label: 'Shipment status', class: 'w-[12%]', rowClass: 'align-top whitespace-normal' },
    { key: 'actions', label: '', class: 'w-[120px]', rowClass: 'align-top' },
  ];
});

// ─── Applying an NDR action ──────────────────────────────────────────────────
// Delhivery's NDR API is asynchronous and takes one waybill at a time: it
// answers with a UPL id, which is polled separately for the outcome. A bulk
// apply is therefore a loop, reported per order rather than as a bare count.
const selected = ref<any[]>([]);
const busy = ref<string | null>(null);
const bulkBusy = ref(false);

const bulkAction = computed(() => {
  const actions = [...new Set(selected.value.map((r) => r.action))];
  return actions.length === 1 ? actions[0] as string : null;
});

async function applyAction(row: any) {
  if (!row.actionable) return;
  busy.value = row.awb;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/ndr', {
      method: 'POST', body: { awb: row.awb, action: row.action },
    });
    toast.add({
      title: `${actionLabel(row.action)} queued · AWB ${row.awb}`,
      description: res?.uplId
        ? `Request ${res.uplId} — track it under Auto Reattempt.`
        : 'Submitted to the carrier.',
      color: 'green',
    });
    await load();
  } catch (e: any) {
    toast.add({
      title: `Could not queue ${actionLabel(row.action)}`,
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    busy.value = null;
  }
}

async function applySelected() {
  const targets = selected.value.filter((r) => r.actionable);
  if (!targets.length) return;
  bulkBusy.value = true;
  const failures: string[] = [];
  let queued = 0;
  for (const row of targets) {
    try {
      await $fetch('/api/ecommerce-cms/shipping/ndr', {
        method: 'POST', body: { awb: row.awb, action: row.action },
      });
      queued++;
    } catch (e: any) {
      failures.push(`• ${row.awb} — ${carrierError(e)}`);
    }
  }
  toast.add({
    title: `${queued} action(s) queued`,
    description: failures.length ? `${failures.length} failed:\n${failures.join('\n')}` : undefined,
    color: queued ? 'green' : 'red',
    timeout: failures.length ? 0 : 5000,
    ui: { description: 'whitespace-pre-line' },
  });
  selected.value = [];
  bulkBusy.value = false;
  await load();
}

// ─── Outcome of a queued request ─────────────────────────────────────────────
const uplOpen = ref(false);
const uplLoading = ref(false);
const uplRow = ref<any>(null);
const uplResult = ref<any>(null);

async function checkStatus(row: any) {
  const uplId = row.upl?.id;
  if (!uplId) return;
  uplRow.value = row;
  uplResult.value = null;
  uplOpen.value = true;
  uplLoading.value = true;
  try {
    uplResult.value = await $fetch('/api/ecommerce-cms/shipping/ndr-status', { query: { uplId } });
  } catch (e: any) {
    toast.add({ title: 'Status check failed', description: carrierError(e), color: 'red', ui: { description: 'whitespace-pre-line' } });
    uplOpen.value = false;
  } finally {
    uplLoading.value = false;
  }
}

const actionLabel = (action?: string | null) =>
  action === 'RE-ATTEMPT' ? 'Re-attempt delivery'
    : action === 'PICKUP_RESCHEDULE' ? 'Reschedule pickup'
      : 'NDR action';

const money = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(value || 0));

const when = (value?: string | null) =>
  value ? format(new Date(value), 'dd MMM yyyy, hh:mm a') : '—';

// Delhivery asks for actions after 9 PM: by then the day's dispatches are closed
// and every NDR parcel is back in the facility, so the action lands on a
// shipment that is actually sitting still.
const beforeNine = computed(() => new Date().getHours() < 21);
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="p-6 space-y-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Failed deliveries (NDR)</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Shipments the carrier could not deliver. Re-attempt them, reschedule a cancelled pickup,
            or let the ones that are out of attempts come back to you.
          </p>
        </div>
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
          :loading="loading"
          @click="load"
        >
          Refresh
        </UButton>
      </div>

      <UAlert
        v-if="beforeNine && data.needAction.length"
        icon="i-heroicons-clock"
        color="amber"
        variant="soft"
        title="Best applied after 9 PM"
        description="Delhivery asks for NDR actions late in the evening, once the day's dispatches are closed and the parcels are back in the facility. Applying now can be rejected or land on a parcel that is still out."
      />

      <UCard>
        <UTabs v-model="tab" :items="tabs">
          <template #default="{ item, selected: isSelected }">
            <span :class="isSelected ? 'font-medium' : ''">{{ item.label }}</span>
            <UBadge v-if="item.count" :color="isSelected ? 'primary' : 'gray'" variant="subtle" size="xs" class="ml-2">
              {{ item.count }}
            </UBadge>
          </template>
        </UTabs>

        <div class="mt-4 grid gap-3 md:grid-cols-[1fr_170px_150px_150px]">
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search AWB, consignee, phone, order"
          />
          <USelect v-model="days" :options="windowOptions" value-attribute="value" option-attribute="label" />
          <USelect v-model="paymentFilter" :options="paymentOptions" />
          <USelect v-model="attemptFilter" :options="attemptOptions" :ui="{ base: 'w-full' }" />
        </div>

        <!-- Bulk apply, Need Action only: the other tabs have nothing to submit. -->
        <div
          v-if="tabKey === 'needAction' && selected.length"
          class="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-gray-50 px-4 py-3 dark:bg-gray-800/60"
        >
          <span class="text-sm text-gray-700 dark:text-gray-200">{{ selected.length }} selected</span>
          <UButton
            v-if="bulkAction"
            icon="i-heroicons-arrow-path-rounded-square"
            :loading="bulkBusy"
            @click="applySelected"
          >
            {{ actionLabel(bulkAction) }} for {{ selected.length }}
          </UButton>
          <span v-else class="text-sm text-amber-600 dark:text-amber-400">
            The selection mixes re-attempts and pickup reschedules — apply them separately.
          </span>
          <UButton color="gray" variant="ghost" size="xs" @click="selected = []">Clear</UButton>
        </div>

        <UTable
          v-model="selected"
          :rows="rows"
          :columns="columns"
          :loading="loading"
          class="mt-2"
          :ui="{ th: { padding: 'px-3 py-2.5' }, td: { padding: 'px-3 py-3', base: 'align-top' } }"
        >
          <template #empty-state>
            <div class="flex flex-col items-center gap-2 py-10 text-center">
              <UIcon name="i-heroicons-check-circle" class="h-8 w-8 text-green-500" />
              <p class="text-sm text-gray-600 dark:text-gray-300">
                Nothing here — no shipment in the last {{ days }} days is in this state.
              </p>
            </div>
          </template>

          <template #order-data="{ row }">
            <div class="min-w-0">
              <NuxtLink
                :to="`/order/ecomorders?q=${row.awb}`"
                class="font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                #{{ row.orderNumber ?? row.orderId?.slice(0, 8) }}
              </NuxtLink>
              <p class="truncate text-xs text-gray-500">AWB {{ row.awb }}</p>
              <p class="truncate text-xs text-gray-400" :title="`${row.consignee || ''} · ${row.phone || ''}`">
                {{ row.consignee || 'Customer' }}
              </p>
            </div>
          </template>

          <template #products-data="{ row }">
            <div class="min-w-0">
              <p class="truncate text-sm text-gray-900 dark:text-white" :title="row.products">
                {{ row.products || 'No item snapshot' }}
              </p>
              <p class="text-xs text-gray-500">
                {{ row.itemCount }} item{{ row.itemCount === 1 ? '' : 's' }} · {{ money(row.grandTotal) }}
              </p>
              <p class="truncate text-xs text-gray-400">{{ row.city }} — {{ row.pincode }}</p>
            </div>
          </template>

          <template #paymentMode-data="{ row }">
            <UBadge :color="row.paymentMode === 'COD' ? 'amber' : 'gray'" variant="subtle">
              {{ row.paymentMode }}
            </UBadge>
          </template>

          <template #ndrType-data="{ row }">
            <div class="min-w-0">
              <!-- The carrier's own words, never our paraphrase — this is what
                   their support desk recognises on a call. -->
              <p class="text-sm text-gray-900 dark:text-white">{{ row.ndrType }}</p>
              <p v-if="row.nsl" class="text-xs text-gray-400">NSL {{ row.nsl }}</p>
              <p v-if="row.blockedReason" class="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                {{ row.blockedReason }}
              </p>
            </div>
          </template>

          <template #attempts-data="{ row }">
            <UBadge :color="row.attempts >= 3 ? 'red' : row.attempts ? 'amber' : 'gray'" variant="subtle">
              {{ row.attempts }}
            </UBadge>
          </template>

          <template #lastUpdated-data="{ row }">
            <span class="text-xs text-gray-500">{{ when(row.lastUpdated) }}</span>
          </template>

          <template #resolvedBy-data="{ row }">
            <div v-if="row.upl" class="min-w-0">
              <p class="text-sm text-gray-900 dark:text-white">{{ actionLabel(row.upl.action) }}</p>
              <p class="truncate text-xs text-gray-400" :title="`UPL ${row.upl.id}`">{{ row.upl.id }}</p>
              <p class="text-xs text-gray-400">{{ when(row.upl.at) }}</p>
            </div>
            <span v-else class="text-xs text-gray-400">Not submitted</span>
          </template>

          <template #status-data="{ row }">
            <UBadge :color="statusColor(row.status)" variant="subtle" :title="statusHint(row.status)">
              {{ statusLabel(row.status) }}
            </UBadge>
          </template>

          <template #actions-data="{ row }">
            <div class="flex justify-end">
              <UButton
                v-if="tabKey === 'needAction'"
                size="xs"
                :loading="busy === row.awb"
                :disabled="!row.actionable"
                :title="row.blockedReason || actionLabel(row.action)"
                @click="applyAction(row)"
              >
                {{ row.action === 'PICKUP_RESCHEDULE' ? 'Reschedule' : 'Re-attempt' }}
              </UButton>
              <UButton
                v-else-if="row.upl"
                size="xs"
                color="gray"
                variant="soft"
                icon="i-heroicons-clock"
                @click="checkStatus(row)"
              >
                Status
              </UButton>
              <UButton
                v-else
                size="xs"
                color="gray"
                variant="ghost"
                icon="i-heroicons-arrow-top-right-on-square"
                :to="`/order/ecomorders?q=${row.awb}`"
              >
                Order
              </UButton>
            </div>
          </template>
        </UTable>

        <p v-if="!loading" class="mt-3 text-xs text-gray-400">
          {{ data.checked }} shipment(s) checked with the carrier · live NSL codes, not a stored flag.
        </p>
      </UCard>
    </div>

    <!-- Outcome of one queued request (Delhivery answers asynchronously). -->
    <UModal v-model="uplOpen">
      <UCard>
        <template #header>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              {{ actionLabel(uplRow?.upl?.action) }} · AWB {{ uplRow?.awb }}
            </h3>
            <p class="text-xs text-gray-500">Request {{ uplRow?.upl?.id }} · queued {{ when(uplRow?.upl?.at) }}</p>
          </div>
        </template>

        <div v-if="uplLoading" class="flex items-center gap-2 text-sm text-gray-500">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" /> Asking the carrier…
        </div>
        <pre
          v-else
          class="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >{{ JSON.stringify(uplResult?.response ?? uplResult, null, 2) }}</pre>

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" variant="soft" @click="uplOpen = false">Close</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
