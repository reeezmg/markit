<script setup lang="ts">
/**
 * Raise a return or exchange on the customer's behalf.
 *
 * Customers raise these from the storefront, but plenty arrive by phone or
 * WhatsApp instead. This is the same request row, created by the seller and
 * already approved — so the reverse pickup or exchange shipment can be created
 * immediately from the list behind it.
 */
import { format } from 'date-fns';

const props = defineProps<{ modelValue: boolean; type: 'return' | 'exchange' }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [] }>();

const toast = useToast();
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const label = computed(() => (props.type === 'return' ? 'return' : 'exchange'));

// ─── Order picker ────────────────────────────────────────────────────────────
const search = ref('');
const searching = ref(false);
const orders = ref<any[]>([]);
const order = ref<any>(null);

let timer: any = null;
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(loadOrders, 300);
});

async function loadOrders() {
  searching.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/returns/orders', { query: { q: search.value.trim() } });
    orders.value = res.orders || [];
  } catch (e: any) {
    toast.add({ title: 'Could not load orders', description: carrierError(e), color: 'red' });
  } finally {
    searching.value = false;
  }
}

// Reset every time it opens: a stale order from the last request is the one
// mistake this form must not make easy.
watch(open, (isOpen) => {
  if (!isOpen) return;
  search.value = '';
  order.value = null;
  reason.value = '';
  fee.value = 0;
  selectedItems.value = [];
  loadOrders();
});

const orderItems = computed(() => (Array.isArray(order.value?.items) ? order.value.items : []));
const itemKey = (item: any, i: number) => String(item.variantId || item.id || item.sku || i);

function pickOrder(row: any) {
  order.value = row;
  // Everything in the order is included unless the seller narrows it down.
  selectedItems.value = orderItems.value.map((item: any, i: number) => itemKey(item, i));
}

// ─── The request ─────────────────────────────────────────────────────────────
const reason = ref('');
const fee = ref(0);
const selectedItems = ref<string[]>([]);
const saving = ref(false);

const items = computed(() =>
  orderItems.value.filter((item: any, i: number) => selectedItems.value.includes(itemKey(item, i))));

const canSave = computed(() => Boolean(order.value && reason.value.trim() && !saving.value));

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/returns/create', {
      method: 'POST',
      body: {
        orderId: order.value.id,
        type: props.type,
        reason: reason.value.trim(),
        // An empty list means the whole order, which is what the shipment
        // builder falls back to as well.
        items: items.value.length === orderItems.value.length ? [] : items.value,
        fee: Number(fee.value || 0),
      },
    });
    toast.add({
      title: `${label.value === 'return' ? 'Return' : 'Exchange'} raised for #${res.orderNumber}`,
      description: `Approved — create the ${label.value === 'return' ? 'reverse pickup' : 'exchange shipment'} from the list.`,
      color: 'green',
    });
    open.value = false;
    emit('created');
  } catch (e: any) {
    toast.add({
      title: `Could not raise the ${label.value}`,
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    saving.value = false;
  }
}

const money = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(value || 0));
</script>

<template>
  <UModal v-model="open" :ui="{ width: 'sm:max-w-2xl' }">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold capitalize">Raise a {{ label }}</h2>
        <p class="text-xs text-gray-500">
          For a request that came in by phone or message. It is created already approved, on the
          customer's behalf.
        </p>
      </template>

      <div class="space-y-4">
        <!-- Step 1: which order -->
        <div v-if="!order">
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search order number, customer, phone or AWB"
            :loading="searching"
            autofocus
          />
          <div class="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <p v-if="!orders.length && !searching" class="p-4 text-center text-sm text-gray-500">
              No delivered orders match. Only orders that reached the customer can be returned or exchanged.
            </p>
            <button
              v-for="row in orders"
              :key="row.id"
              type="button"
              class="flex w-full items-start justify-between gap-3 border-b border-gray-100 p-3 text-left last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
              @click="pickOrder(row)"
            >
              <div class="min-w-0">
                <p class="font-medium text-gray-900 dark:text-white">
                  #{{ row.orderNumber }}
                  <UBadge color="gray" variant="subtle" size="xs" class="ml-1">{{ statusLabel(row.status) }}</UBadge>
                </p>
                <p class="truncate text-xs text-gray-500">{{ row.customer || 'Customer' }} · {{ row.phone || '—' }}</p>
                <p class="truncate text-xs text-gray-400">
                  {{ format(new Date(row.createdAt), 'dd MMM yyyy') }}
                  <span v-if="row.awb"> · AWB {{ row.awb }}</span>
                </p>
              </div>
              <span class="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ money(row.grandTotal) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Step 2: the request itself -->
        <template v-else>
          <div class="flex items-start justify-between gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
            <div class="min-w-0">
              <p class="font-medium text-gray-900 dark:text-white">#{{ order.orderNumber }}</p>
              <p class="truncate text-xs text-gray-500">{{ order.customer || 'Customer' }} · {{ order.phone || '—' }}</p>
              <p v-if="order.awb" class="truncate text-xs text-gray-400">AWB {{ order.awb }}</p>
            </div>
            <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-arrow-path" @click="order = null">
              Change
            </UButton>
          </div>

          <UFormGroup label="Reason" required :help="`Kept on the request and shown to whoever handles the ${label}`">
            <UTextarea v-model="reason" :rows="2" :placeholder="`Why is this ${label} being raised?`" />
          </UFormGroup>

          <UFormGroup
            v-if="orderItems.length > 1"
            label="Items"
            help="All items are included unless you narrow it down"
          >
            <div class="max-h-40 space-y-1 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
              <UCheckbox
                v-for="(item, i) in orderItems"
                :key="itemKey(item, i)"
                v-model="selectedItems"
                :value="itemKey(item, i)"
                :label="`${item.name || item.variantName || 'Item'} ×${item.quantity || item.qty || 1}`"
              />
            </div>
          </UFormGroup>

          <UFormGroup
            :label="`${label === 'return' ? 'Return' : 'Exchange'} fee`"
            help="Charged to the customer; leave at 0 for a free request"
          >
            <UInput v-model.number="fee" type="number" min="0" step="1" />
          </UFormGroup>
        </template>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!canSave" icon="i-heroicons-check" @click="save">
            Raise {{ label }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
