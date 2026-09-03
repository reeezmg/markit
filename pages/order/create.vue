<script setup lang="ts">
/**
 * Create an ecommerce order by hand.
 *
 * The storefront is not the only way an order arrives — plenty come in by
 * phone, over WhatsApp, or from a customer at the counter who wants it
 * delivered. This screen produces exactly the same order those would: it takes
 * stock, writes a bill, and appears in /order/ecomorders to be shipped and
 * tracked like any other.
 *
 * Money is never calculated here. The totals shown are a preview built from the
 * prices the search endpoint returned; the server prices the order again from
 * the database when it is created, and its answer is the one that counts.
 */
definePageMeta({ auth: true });

const toast = useToast();

// ─── Customer ────────────────────────────────────────────────────────────────
// Two ways in: find someone who has bought before, or type in someone new. A
// returning customer brings their saved addresses with them, which is most of
// the form filled in already.
// UTabs is index-based, so the tab index is the source of truth and the mode is
// derived from it — keeping both as writable state would let them disagree.
const customerTab = ref(0);
const customerMode = computed<'existing' | 'new'>(() => (customerTab.value === 0 ? 'existing' : 'new'));
const clientSearch = ref('');
const clientResults = ref<any[]>([]);
const clientSearching = ref(false);
const selectedClient = ref<any>(null);
const newClient = reactive({ name: '', phone: '', email: '' });

let clientTimer: any = null;
watch(clientSearch, (value) => {
  clearTimeout(clientTimer);
  const q = value.trim();
  if (!q) { clientResults.value = []; return; }
  clientTimer = setTimeout(async () => {
    clientSearching.value = true;
    try {
      const res: any = await $fetch('/api/ecommerce-cms/orders/client-search', { query: { q } });
      clientResults.value = res.clients || [];
    } catch (e: any) {
      toast.add({ title: 'Customer search failed', description: carrierError(e), color: 'red' });
    } finally {
      clientSearching.value = false;
    }
  }, 300);
});

function pickClient(client: any) {
  selectedClient.value = client;
  clientResults.value = [];
  clientSearch.value = '';
  // One saved address means there is nothing to choose — just use it.
  if (client.addresses?.length === 1) useAddress(client.addresses[0]);
}

function clearClient() {
  selectedClient.value = null;
}

// ─── Delivery address ────────────────────────────────────────────────────────
const address = reactive({
  name: '',
  phoneNo: '',
  houseDetails: '',
  street: '',
  locality: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
});
const saveAddress = ref(true);

function useAddress(saved: any) {
  Object.assign(address, {
    name: saved.name || '',
    phoneNo: saved.phoneNo || '',
    houseDetails: saved.houseDetails || '',
    street: saved.street || '',
    locality: saved.locality || '',
    landmark: saved.landmark || '',
    city: saved.city || '',
    state: saved.state || '',
    pincode: saved.pincode || '',
  });
  // It is already on file — saving it again would just duplicate the row.
  saveAddress.value = false;
}

const addressSummary = (saved: any) =>
  [saved.houseDetails, saved.street, saved.locality, saved.city, saved.state, saved.pincode]
    .filter(Boolean).join(', ');

// ─── Products ────────────────────────────────────────────────────────────────
// The search returns ITEMS, not products: an item is one size of one variant,
// which is the only thing that actually holds stock and the only thing an order
// line can point at.
const productSearch = ref('');
const productResults = ref<any[]>([]);
const productSearching = ref(false);
const lines = ref<any[]>([]);

let productTimer: any = null;
watch(productSearch, (value) => {
  clearTimeout(productTimer);
  const q = value.trim();
  if (q.length < 2) { productResults.value = []; return; }
  productTimer = setTimeout(async () => {
    productSearching.value = true;
    try {
      const res: any = await $fetch('/api/ecommerce-cms/orders/product-search', { query: { q } });
      productResults.value = res.products || [];
    } catch (e: any) {
      toast.add({ title: 'Product search failed', description: carrierError(e), color: 'red' });
    } finally {
      productSearching.value = false;
    }
  }, 300);
});

function addProduct(product: any) {
  const existing = lines.value.find((l) => l.itemId === product.itemId);
  if (existing) {
    // Adding the same size twice means "one more", not a second line.
    if (existing.quantity >= product.stock) {
      toast.add({ title: `Only ${product.stock} in stock`, color: 'orange' });
      return;
    }
    existing.quantity += 1;
  } else {
    lines.value.push({ ...product, quantity: 1 });
  }
  productSearch.value = '';
  productResults.value = [];
}

function setQuantity(line: any, quantity: number) {
  const asked = Number(quantity) || 1;
  // Clamping silently would let the seller believe they had ordered more than
  // they have, so exceeding the stock says so. Clearing the field to retype it
  // is not a mistake and stays quiet.
  if (asked > line.stock) {
    toast.add({ title: `Only ${line.stock} in stock`, color: 'orange' });
  }
  line.quantity = Math.max(1, Math.min(asked, line.stock));
}

function removeLine(itemId: string) {
  lines.value = lines.value.filter((l) => l.itemId !== itemId);
}

const imageUrl = (key?: string | null) =>
  key ? `https://images.markit.co.in/${key}` : null;

// ─── Charges ─────────────────────────────────────────────────────────────────
const paymentMethod = ref('COD');
const paymentStatus = ref('PENDING');
const deliveryFee = ref(0);
const discount = ref(0);
const notes = ref('');

const paymentMethods = ['COD', 'UPI', 'CARD', 'CASH', 'BANK'];
const paymentStatuses = [
  { value: 'PENDING', label: 'Not paid yet' },
  { value: 'PAID', label: 'Already paid' },
];

const money = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(Number(value || 0));

// A preview only — the server prices the order again on create, so a stale
// price here is corrected rather than trusted.
const subtotal = computed(() =>
  lines.value.reduce((sum, l) => sum + Number(l.dprice || 0) * Number(l.quantity || 0), 0));
const unitCount = computed(() => lines.value.reduce((sum, l) => sum + Number(l.quantity || 0), 0));

// ─── Coupon ──────────────────────────────────────────────────────────────────
// Quoted against the current basket, redeemed only when the order is created.
// The same rules the storefront applies — a coupon it would refuse is refused
// here too, so the counter is not a way around the seller's own limits.
const couponCode = ref('');
const appliedCoupon = ref<any>(null);
const couponChecking = ref(false);
const couponError = ref('');
const couponSuggestions = ref<any[]>([]);

async function loadCoupons(code?: string) {
  couponError.value = '';
  couponChecking.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/orders/coupons', {
      query: {
        clientId: selectedClient.value?.id || '',
        subtotal: subtotal.value,
        ...(code ? { code } : {}),
      },
    });
    return res.coupons || [];
  } catch (e: any) {
    couponError.value = carrierError(e);
    return [];
  } finally {
    couponChecking.value = false;
  }
}

async function applyCoupon() {
  const code = couponCode.value.trim();
  if (!code) return;
  const found = await loadCoupons(code);
  if (!found.length) {
    couponError.value = 'That code is not valid for this order — check the customer, the code and the order value.';
    appliedCoupon.value = null;
    return;
  }
  appliedCoupon.value = found[0];
}

async function showAvailableCoupons() {
  couponSuggestions.value = await loadCoupons();
  if (!couponSuggestions.value.length && !couponError.value) {
    couponError.value = 'No coupon is available for this customer and order value.';
  }
}

function useCoupon(coupon: any) {
  appliedCoupon.value = coupon;
  couponCode.value = coupon.code;
  couponSuggestions.value = [];
  couponError.value = '';
}

function removeCoupon() {
  appliedCoupon.value = null;
  couponCode.value = '';
  couponError.value = '';
}

// A coupon priced against a basket that has since changed is misleading, so it
// is re-quoted whenever the basket or the customer moves. Re-quoting can also
// find it no longer eligible (the order dropped below its minimum), which is
// exactly what the seller needs to see before creating the order.
watch([subtotal, selectedClient], async () => {
  if (!appliedCoupon.value) return;
  const found = await loadCoupons(appliedCoupon.value.code);
  if (found.length) {
    appliedCoupon.value = found[0];
  } else {
    appliedCoupon.value = null;
    couponError.value = 'The coupon no longer applies to this order and has been removed.';
  }
});


// Declared after the coupon so the reader meets both halves of the discount
// before the sum of them. The coupon's share is the server's own quote, never
// recomputed here.
const couponAmount = computed(() => Number(appliedCoupon.value?.discount || 0));
// Coupon and manual reduction are capped TOGETHER, exactly as the server does
// it — capping them separately would let the pair exceed the subtotal.
const cappedDiscount = computed(() =>
  Math.min(subtotal.value, couponAmount.value + Math.max(0, Number(discount.value) || 0)));
const grandTotal = computed(() =>
  Math.max(0, subtotal.value + (Number(deliveryFee.value) || 0) - cappedDiscount.value));

// ─── Create ──────────────────────────────────────────────────────────────────
const customerReady = computed(() => {
  if (customerMode.value === 'existing') return Boolean(selectedClient.value?.id);
  return newClient.name.trim().length > 0
    && newClient.phone.replace(/\D/g, '').length >= 10;
});
const canCreate = computed(() =>
  customerReady.value && lines.value.length > 0 && address.pincode.trim().length > 0);

const creating = ref(false);

async function createOrder() {
  if (!canCreate.value) return;
  creating.value = true;
  try {
    const res: any = await $fetch('/api/ecommerce-cms/orders/create', {
      method: 'POST',
      body: {
        client: customerMode.value === 'existing'
          ? { id: selectedClient.value.id }
          : { name: newClient.name, phone: newClient.phone, email: newClient.email },
        address: { ...address },
        saveAddress: saveAddress.value,
        items: lines.value.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        paymentMethod: paymentMethod.value,
        paymentStatus: paymentStatus.value,
        deliveryFee: Number(deliveryFee.value) || 0,
        discount: Number(discount.value) || 0,
        couponId: appliedCoupon.value?.id || null,
        notes: notes.value,
      },
    });
    toast.add({
      title: `Order #${res.orderNumber} created`,
      description: `${res.items} line(s) · ${money(res.grandTotal)} · stock has been taken`,
      color: 'green',
      timeout: 8000,
    });
    // Land the seller where the order now lives, filtered to it.
    await navigateTo(`/order/ecomorders?q=${res.orderNumber}`);
  } catch (e: any) {
    toast.add({
      title: 'Could not create the order',
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <UDashboardPanelContent class="space-y-6 pb-24">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">New order</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          For orders that did not come through the storefront — by phone, WhatsApp, or at the counter.
          It takes stock and writes a bill, exactly like a storefront order.
        </p>
      </div>
      <UButton icon="i-heroicons-arrow-left" color="gray" variant="soft" to="/order/ecomorders">
        Back to orders
      </UButton>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <!-- Customer -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Customer</h2>
          </template>

          <div class="space-y-4">
            <UTabs
              v-model="customerTab"
              :items="[{ label: 'Existing customer' }, { label: 'New customer' }]"
            />

            <template v-if="customerMode === 'existing'">
              <div v-if="selectedClient" class="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">{{ selectedClient.name }}</p>
                  <p class="text-sm text-gray-500">{{ selectedClient.phone }}<span v-if="selectedClient.email"> · {{ selectedClient.email }}</span></p>
                </div>
                <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="clearClient()">
                  Change
                </UButton>
              </div>

              <template v-else>
                <UFormGroup label="Find the customer" hint="Name, phone or email">
                  <UInput
                    v-model="clientSearch"
                    icon="i-heroicons-magnifying-glass"
                    placeholder="Search your customers"
                    :loading="clientSearching"
                  />
                </UFormGroup>
                <div v-if="clientResults.length" class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                  <button
                    v-for="c in clientResults"
                    :key="c.id"
                    type="button"
                    class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                    @click="pickClient(c)"
                  >
                    <span>
                      <span class="block text-sm font-medium text-gray-900 dark:text-white">{{ c.name }}</span>
                      <span class="block text-xs text-gray-500">{{ c.phone }}</span>
                    </span>
                    <UBadge v-if="c.addresses?.length" color="gray" variant="soft" size="xs">
                      {{ c.addresses.length }} address(es)
                    </UBadge>
                  </button>
                </div>
                <p v-else-if="clientSearch && !clientSearching" class="text-sm text-gray-500">
                  No customer found — switch to <span class="font-medium">New customer</span> to add them.
                </p>
              </template>

              <!-- Saved addresses, once a customer is chosen -->
              <div v-if="selectedClient?.addresses?.length" class="space-y-2">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Saved addresses</p>
                <button
                  v-for="a in selectedClient.addresses"
                  :key="a.id"
                  type="button"
                  class="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-primary-500 dark:border-gray-700"
                  @click="useAddress(a)"
                >
                  {{ addressSummary(a) }}
                </button>
              </div>
            </template>

            <template v-else>
              <div class="grid gap-4 sm:grid-cols-3">
                <UFormGroup label="Name" required>
                  <UInput v-model="newClient.name" placeholder="Full name" />
                </UFormGroup>
                <UFormGroup label="Phone" required hint="10 digits">
                  <UInput v-model="newClient.phone" placeholder="9876543210" />
                </UFormGroup>
                <UFormGroup label="Email">
                  <UInput v-model="newClient.email" placeholder="Optional" />
                </UFormGroup>
              </div>
              <UAlert
                icon="i-heroicons-information-circle"
                color="blue"
                variant="soft"
                title="Already on Markit?"
                description="If this phone number belongs to an existing Markit customer, they are reused and linked to your store rather than duplicated."
              />
            </template>
          </div>
        </UCard>

        <!-- Delivery address -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Delivery address</h2>
          </template>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormGroup label="Name on the address">
              <UInput v-model="address.name" placeholder="Who receives it" />
            </UFormGroup>
            <UFormGroup label="Phone">
              <UInput v-model="address.phoneNo" placeholder="Contact for the courier" />
            </UFormGroup>
            <UFormGroup label="House / flat">
              <UInput v-model="address.houseDetails" />
            </UFormGroup>
            <UFormGroup label="Street">
              <UInput v-model="address.street" />
            </UFormGroup>
            <UFormGroup label="Locality">
              <UInput v-model="address.locality" />
            </UFormGroup>
            <UFormGroup label="Landmark">
              <UInput v-model="address.landmark" />
            </UFormGroup>
            <UFormGroup label="City">
              <UInput v-model="address.city" />
            </UFormGroup>
            <UFormGroup label="State">
              <UInput v-model="address.state" />
            </UFormGroup>
            <UFormGroup label="Pincode" required hint="The carrier cannot quote without one">
              <UInput v-model="address.pincode" placeholder="682001" />
            </UFormGroup>
            <div class="flex items-end">
              <UCheckbox v-model="saveAddress" label="Save this address to the customer" />
            </div>
          </div>
        </UCard>

        <!-- Products -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Products</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Only products with stock can be added — search by product name, variant or barcode.
            </p>
          </template>

          <div class="space-y-4">
            <UInput
              v-model="productSearch"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search products to add"
              :loading="productSearching"
            />

            <div v-if="productResults.length" class="max-h-72 divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              <button
                v-for="p in productResults"
                :key="p.itemId"
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                @click="addProduct(p)"
              >
                <img
                  v-if="imageUrl(p.images?.[0])"
                  :src="imageUrl(p.images?.[0])!"
                  class="h-10 w-10 flex-shrink-0 rounded object-cover"
                  alt=""
                >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-gray-900 dark:text-white">{{ p.productName }}</span>
                  <span class="block truncate text-xs text-gray-500">
                    {{ p.variantName }}<span v-if="p.size"> · {{ p.sizeLabel }} {{ p.size }}</span>
                  </span>
                </span>
                <span class="flex-shrink-0 text-right">
                  <span class="block text-sm font-medium">{{ money(p.dprice) }}</span>
                  <span class="block text-xs text-gray-500">{{ p.stock }} in stock</span>
                </span>
              </button>
            </div>

            <p v-if="!lines.length" class="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700">
              No products yet. Search above to add the first one.
            </p>

            <div v-else class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              <div v-for="line in lines" :key="line.itemId" class="flex items-center gap-3 px-3 py-2">
                <img
                  v-if="imageUrl(line.images?.[0])"
                  :src="imageUrl(line.images?.[0])!"
                  class="h-10 w-10 flex-shrink-0 rounded object-cover"
                  alt=""
                >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ line.productName }}</p>
                  <p class="truncate text-xs text-gray-500">
                    {{ line.variantName }}<span v-if="line.size"> · {{ line.sizeLabel }} {{ line.size }}</span>
                    · {{ line.stock }} in stock
                  </p>
                </div>
                <UInput
                  :model-value="line.quantity"
                  type="number"
                  min="1"
                  :max="line.stock"
                  class="w-20"
                  @update:model-value="(v: any) => setQuantity(line, v)"
                />
                <div class="w-24 text-right text-sm font-medium">
                  {{ money(line.dprice * line.quantity) }}
                </div>
                <UButton
                  size="xs"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  @click="removeLine(line.itemId)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Summary -->
      <div class="space-y-6">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Payment &amp; charges</h2>
          </template>

          <div class="space-y-4">
            <UFormGroup label="Payment method">
              <USelect v-model="paymentMethod" :options="paymentMethods" />
            </UFormGroup>
            <UFormGroup label="Payment status">
              <USelect v-model="paymentStatus" :options="paymentStatuses" />
            </UFormGroup>
            <UFormGroup label="Delivery fee">
              <UInput v-model="deliveryFee" type="number" min="0" />
            </UFormGroup>
            <UFormGroup label="Coupon">
              <div v-if="appliedCoupon" class="flex items-center justify-between gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-green-800 dark:text-green-300">
                    {{ appliedCoupon.code }}
                  </p>
                  <p class="truncate text-xs text-green-700 dark:text-green-400">
                    {{ appliedCoupon.description }} · −{{ money(appliedCoupon.discount) }}
                  </p>
                </div>
                <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="removeCoupon()" />
              </div>

              <div v-else class="flex gap-2">
                <UInput
                  v-model="couponCode"
                  placeholder="Enter code"
                  class="flex-1"
                  @keyup.enter="applyCoupon()"
                />
                <UButton
                  color="gray"
                  variant="soft"
                  :loading="couponChecking"
                  :disabled="!couponCode.trim() || !lines.length"
                  @click="applyCoupon()"
                >
                  Apply
                </UButton>
              </div>

              <template #hint>
                <UButton
                  size="xs"
                  color="gray"
                  variant="link"
                  :padded="false"
                  :disabled="!lines.length"
                  @click="showAvailableCoupons()"
                >
                  See available
                </UButton>
              </template>
            </UFormGroup>

            <!-- Browsing what this customer could use on this basket -->
            <div v-if="couponSuggestions.length" class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              <button
                v-for="c in couponSuggestions"
                :key="c.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                @click="useCoupon(c)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ c.code }}</span>
                  <span class="block truncate text-xs text-gray-500">{{ c.description }}</span>
                </span>
                <span class="flex-shrink-0 text-sm font-medium text-green-600">−{{ money(c.discount) }}</span>
              </button>
            </div>

            <p v-if="couponError" class="text-xs text-red-600 dark:text-red-400">{{ couponError }}</p>

            <UFormGroup label="Manual discount" hint="On top of any coupon; the pair is capped at the subtotal">
              <UInput v-model="discount" type="number" min="0" />
            </UFormGroup>
            <UFormGroup label="Notes">
              <UTextarea v-model="notes" :rows="2" placeholder="Anything to remember about this order" />
            </UFormGroup>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Summary</h2>
          </template>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">{{ lines.length }} line(s), {{ unitCount }} unit(s)</span>
              <span>{{ money(subtotal) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Delivery</span>
              <span>{{ money(deliveryFee) }}</span>
            </div>
            <div v-if="couponAmount" class="flex justify-between text-green-600">
              <span>Coupon {{ appliedCoupon?.code }}</span>
              <span>-{{ money(couponAmount) }}</span>
            </div>
            <div v-if="Number(discount) > 0" class="flex justify-between text-green-600">
              <span>Manual discount</span>
              <span>-{{ money(discount) }}</span>
            </div>
            <p
              v-if="couponAmount + Number(discount || 0) > subtotal"
              class="text-xs text-amber-600 dark:text-amber-400"
            >
              Capped at the subtotal — {{ money(cappedDiscount) }} will be taken off.
            </p>
            <div class="flex justify-between border-t border-gray-200 pt-2 font-semibold dark:border-gray-700">
              <span>Total</span>
              <span>{{ money(grandTotal) }}</span>
            </div>
            <p class="pt-1 text-xs text-gray-500">
              A preview. The server prices the order from the database when you create it, and tax is
              applied according to your store's settings.
            </p>
          </div>

          <template #footer>
            <div class="space-y-3">
              <UAlert
                v-if="!canCreate"
                icon="i-heroicons-information-circle"
                color="orange"
                variant="soft"
                :description="!customerReady
                  ? 'Choose or add a customer to continue.'
                  : !lines.length
                    ? 'Add at least one product.'
                    : 'A delivery pincode is required.'"
              />
              <UButton
                block
                icon="i-heroicons-check-circle"
                :loading="creating"
                :disabled="!canCreate"
                @click="createOrder()"
              >
                Create order
              </UButton>
              <p class="text-center text-xs text-gray-500">
                This takes {{ unitCount }} unit(s) out of stock immediately.
              </p>
            </div>
          </template>
        </UCard>
      </div>
    </div>
  </UDashboardPanelContent>
</template>
