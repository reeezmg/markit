<script setup lang="ts">
import { useFindFirstGeneralPreference, useUpsertGeneralPreference } from '~/lib/hooks';

definePageMeta({ auth: true });

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

const PAGE_NAME = 'ecomm_shipping';
const PREF_KEY  = 'provider_config';

type ProviderId =
  | 'shiprocket' | 'delhivery' | 'bluedart' | 'ecomexpress' | 'xpressbees'
  | 'shadowfax'  | 'dtdc'      | 'pickrr'   | 'dunzo'       | 'ekart' | 'speedpost';

const PROVIDERS: Array<{
  id: ProviderId; label: string; abbr: string; tagline: string;
  from: string; to: string; type: string; coverage: string;
  testSupport: boolean; docsUrl: string; features: string[];
  fields: Array<{ key: string; label: string; type?: string; help?: string; placeholder?: string; options?: { label: string; value: string }[] }>
}> = [
  {
    id: 'shiprocket', label: 'Shiprocket', abbr: 'SR', type: 'Aggregator',
    tagline: 'Auto-selects cheapest courier from Delhivery, Bluedart, DTDC & 20+ partners.',
    from: '#ea6c00', to: '#c45910', coverage: '24,000+ pincodes',
    testSupport: true, docsUrl: 'https://apiv2.shiprocket.in',
    features: ['20+ couriers', 'Auto rate select', 'COD', 'Reverse logistics', 'NDR mgmt'],
    fields: [
      { key: 'email',         label: 'Account Email',    placeholder: 'seller@example.com', help: 'Your Shiprocket login email' },
      { key: 'password',      label: 'Account Password', type: 'password' },
      { key: 'pickupPincode', label: 'Pickup Pincode',   placeholder: '560001', help: 'Warehouse / pickup location pincode' },
    ],
  },
  {
    id: 'delhivery', label: 'Delhivery', abbr: 'DL', type: 'Direct Carrier',
    tagline: 'Pan-India leader with real-time tracking and industry-leading delivery rates.',
    from: '#c0392b', to: '#96281b', coverage: '18,500+ pincodes',
    testSupport: true, docsUrl: 'https://developers.delhivery.com',
    features: ['COD', 'Prepaid', 'Express', 'Surface', 'Reverse'],
    fields: [
      { key: 'apiToken',      label: 'API Token',       type: 'password', help: 'Merchant portal → API Access' },
      { key: 'warehouseCode', label: 'Warehouse Code',  placeholder: 'Optional — multi-warehouse only' },
    ],
  },
  {
    id: 'bluedart', label: 'Bluedart', abbr: 'BD', type: 'Premium Carrier',
    tagline: 'DHL-powered premium courier. Ideal for high-value and time-critical shipments.',
    from: '#1e3a8a', to: '#1e40af', coverage: '35,000+ locations',
    testSupport: true, docsUrl: 'https://www.bluedart.com/web/bluedartapi',
    features: ['Same Day', 'Next Day', 'High Value', 'International', 'COD'],
    fields: [
      { key: 'username',    label: 'Username',     help: 'Bluedart API portal credentials' },
      { key: 'password',    label: 'Password',     type: 'password' },
      { key: 'licenseKey',  label: 'License Key',  type: 'password', help: 'Provided on API registration' },
      { key: 'apiKey',      label: 'API Key',      type: 'password', help: 'NetConnect API Key' },
      { key: 'accountCode', label: 'Account Code', help: 'Your Bluedart customer account code' },
    ],
  },
  {
    id: 'ecomexpress', label: 'Ecom Express', abbr: 'EE', type: 'Direct Carrier',
    tagline: 'E-commerce focused carrier with strong COD and reverse logistics network.',
    from: '#b91c1c', to: '#991b1b', coverage: '27,000+ pincodes',
    testSupport: true, docsUrl: 'https://developers.ecomexpress.in',
    features: ['COD', 'Prepaid', 'Reverse', 'Exchange', 'RTO mgmt'],
    fields: [
      { key: 'username',    label: 'Username',    help: 'Merchant portal credentials' },
      { key: 'password',    label: 'Password',    type: 'password' },
      { key: 'environment', label: 'Environment', options: [{ label: 'Production', value: 'PROD' }, { label: 'Beta / Test', value: 'TEST' }] },
    ],
  },
  {
    id: 'xpressbees', label: 'XpressBees', abbr: 'XB', type: 'Direct Carrier',
    tagline: 'Fastest growing logistics network with competitive rates and solid tech.',
    from: '#d97706', to: '#b45309', coverage: '2,500+ cities',
    testSupport: true, docsUrl: 'https://ship.xpressbees.com/api',
    features: ['COD', 'Express', 'Air', 'Surface', 'Reverse'],
    fields: [
      { key: 'clientId',     label: 'Client ID',     help: 'Merchant dashboard → API Settings' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    ],
  },
  {
    id: 'shadowfax', label: 'Shadowfax', abbr: 'SF', type: 'Hyperlocal',
    tagline: 'Powers Swiggy Instamart & Dunzo. Best for same-day and express delivery.',
    from: '#7c3aed', to: '#6d28d9', coverage: '100+ cities',
    testSupport: true, docsUrl: 'https://logistics.shadowfax.in/api/v1',
    features: ['Same Day', 'Express', 'Hyperlocal', 'COD', 'Live tracking'],
    fields: [
      { key: 'apiKey',     label: 'API Key',     type: 'password', help: 'Developer Settings → API Access' },
      { key: 'clientCode', label: 'Client Code', help: 'Your merchant/client code' },
    ],
  },
  {
    id: 'dtdc', label: 'DTDC', abbr: 'DT', type: 'Direct Carrier',
    tagline: "India's longest-running courier with unmatched tier-2/tier-3 reach.",
    from: '#be123c', to: '#9f1239', coverage: '12,000+ pincodes',
    testSupport: true, docsUrl: 'https://dtdcapi.dtdc.com',
    features: ['COD', 'Prepaid', 'Express', 'Ground', 'International'],
    fields: [
      { key: 'customerCode', label: 'Customer Code', help: 'API portal → My Account' },
      { key: 'apiKey',       label: 'API Key',       type: 'password' },
      { key: 'environment',  label: 'Environment',   options: [{ label: 'Production', value: 'PROD' }, { label: 'UAT', value: 'TEST' }] },
    ],
  },
  {
    id: 'pickrr', label: 'Pickrr', abbr: 'PK', type: 'Aggregator',
    tagline: 'AI-powered courier selection from 30+ partners. Now part of Shiprocket.',
    from: '#4f46e5', to: '#4338ca', coverage: '29,000+ pincodes',
    testSupport: true, docsUrl: 'https://pickrr.com/api-v5',
    features: ['30+ couriers', 'AI routing', 'COD', 'Analytics', 'NDR'],
    fields: [
      { key: 'authToken',    label: 'Auth Token',    type: 'password', help: 'Dashboard → Settings → Auth Token' },
      { key: 'facilityCode', label: 'Facility Code', placeholder: 'Optional — multi-warehouse' },
    ],
  },
  {
    id: 'dunzo', label: 'Dunzo', abbr: 'DZ', type: 'Hyperlocal',
    tagline: 'Instant same-city delivery in 30–60 min. Perfect for local businesses.',
    from: '#059669', to: '#047857', coverage: '10+ cities',
    testSupport: true, docsUrl: 'https://api.dunzo.com/api/v1',
    features: ['30-60 min', 'Same-city', 'Live tracking', 'COD', 'Instant'],
    fields: [
      { key: 'clientId',     label: 'Client ID',     help: 'Dunzo for Business → API Access' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
      { key: 'environment',  label: 'Environment',   options: [{ label: 'Production', value: 'PROD' }, { label: 'Staging', value: 'TEST' }] },
    ],
  },
  {
    id: 'ekart', label: 'Ekart', abbr: 'EK', type: 'Direct Carrier',
    tagline: "Flipkart's logistics arm — open to all sellers with wide urban coverage.",
    from: '#1d4ed8', to: '#1e40af', coverage: '3,800+ cities',
    testSupport: false, docsUrl: 'https://api.ekartlogistics.com',
    features: ['COD', 'Prepaid', 'Express', 'Reverse', 'OTP delivery'],
    fields: [
      { key: 'apiKey',     label: 'API Key',     type: 'password', help: 'Logistics partner portal → API Settings' },
      { key: 'sellerCode', label: 'Seller Code', help: 'Your Ekart partner/seller code' },
    ],
  },
  {
    id: 'speedpost', label: 'SpeedPost', abbr: 'SP', type: 'Govt Carrier',
    tagline: 'India Post — widest pincode reach in India at the lowest possible rates.',
    from: '#991b1b', to: '#7f1d1d', coverage: '1,50,000+ post offices',
    testSupport: false, docsUrl: 'https://trackingapi.indiapost.gov.in',
    features: ['Widest reach', 'Cheapest rates', 'COD', 'Tracking', 'Govt-backed'],
    fields: [
      { key: 'username',      label: 'Username',       help: 'India Post eCommerce portal credentials' },
      { key: 'password',      label: 'Password',       type: 'password' },
      { key: 'accountNumber', label: 'Account Number', help: 'SpeedPost account number' },
    ],
  },
];

const defaultCreds = Object.fromEntries(
  PROVIDERS.map((p) => [
    p.id,
    Object.fromEntries(p.fields.map((f) => [f.key, f.options ? f.options[0].value : ''])),
  ]),
) as Record<ProviderId, Record<string, string>>;

interface ShippingConfig {
  primary: ProviderId | '';
  priority: ProviderId[];                 // ordered fallback chain; priority[0] === primary
  providers: Record<ProviderId, { enabled: boolean } & Record<string, string>>;
}

const config = ref<ShippingConfig>({
  primary: '',
  priority: [],
  providers: Object.fromEntries(
    PROVIDERS.map((p) => [p.id, { enabled: false, ...defaultCreds[p.id] }])
  ) as ShippingConfig['providers'],
});

// Keep config.priority == exactly the connected providers, in order; primary is
// always the head of the chain.
function normalizePriority(saved?: ProviderId[]) {
  const connected = PROVIDERS.filter((p) => config.value.providers[p.id]?.enabled).map((p) => p.id);
  const ordered = (saved || []).filter((id) => connected.includes(id));
  for (const id of connected) if (!ordered.includes(id)) ordered.push(id);
  config.value.priority = ordered;
  config.value.primary = ordered[0] || '';
}

const modalOpen      = ref(false);
const activeProvider = ref<typeof PROVIDERS[0] | null>(null);
const tempCreds      = ref<Record<string, string>>({});
const disconnectConfirm = ref<ProviderId | null>(null);
const testStatus     = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
const testMessage    = ref('');

const { data: prefData, isLoading } = useFindFirstGeneralPreference({
  where: { companyId: companyId.value, pageName: PAGE_NAME, key: PREF_KEY },
});

watch(prefData, (val) => {
  if (val?.value) {
    const s = val.value as Partial<ShippingConfig>;
    for (const p of PROVIDERS) {
      const saved = s.providers?.[p.id] || {};
      config.value.providers[p.id] = { enabled: saved.enabled ?? false, ...defaultCreds[p.id], ...saved };
    }
    normalizePriority(s.priority || (s.primary ? [s.primary] : []));
  }
}, { immediate: true });

const isConnected = (id: ProviderId) => config.value.providers[id]?.enabled ?? false;
const isPrimary   = (id: ProviderId) => config.value.primary === id;
const connectedProviders = computed(() => PROVIDERS.filter((p) => isConnected(p.id)));
// Connected carriers in fallback priority order (priority[0] = primary).
const orderedConnected = computed(() =>
  config.value.priority.map((id) => PROVIDERS.find((p) => p.id === id)).filter(Boolean) as typeof PROVIDERS,
);

const isFormValid = computed(() => {
  if (!activeProvider.value) return false;
  return activeProvider.value.fields.every((f) => {
    if (f.options) return true;
    if (f.placeholder?.toLowerCase().includes('optional')) return true;
    return (tempCreds.value[f.key] ?? '').trim() !== '';
  });
});

function openConfigure(p: typeof PROVIDERS[0]) {
  activeProvider.value = p;
  const { enabled, ...creds } = config.value.providers[p.id];
  tempCreds.value = { ...creds };
  testStatus.value = 'idle';
  testMessage.value = '';
  modalOpen.value = true;
}

async function testConnection() {
  if (!activeProvider.value || !isFormValid.value) return;
  testStatus.value = 'testing';
  testMessage.value = '';
  try {
    const res = await $fetch<{ ok: boolean; message: string }>('/api/ecommerce-cms/shipping/test', {
      method: 'POST',
      body: { provider: activeProvider.value.id, credentials: tempCreds.value },
    });
    testStatus.value = 'ok';
    testMessage.value = res.message;
  } catch (e: any) {
    testStatus.value = 'error';
    testMessage.value = e.data?.statusMessage || e.message || 'Connection test failed';
  }
}

const { mutate: upsertPref, isPending: isSaving } = useUpsertGeneralPreference();

function persist(msg?: string) {
  upsertPref(
    {
      where:  { companyId_pageName_key: { companyId: companyId.value, pageName: PAGE_NAME, key: PREF_KEY } },
      create: { companyId: companyId.value, pageName: PAGE_NAME, key: PREF_KEY, value: config.value as any, active: true },
      update: { value: config.value as any },
    },
    {
      onSuccess: () => { if (msg) toast.add({ title: msg, color: 'green' }); },
      onError:   (e: any) => toast.add({ title: 'Save failed', description: e.message, color: 'red' }),
    },
  );
}

function saveCredentials() {
  if (!activeProvider.value || !isFormValid.value) return;
  config.value.providers[activeProvider.value.id] = { enabled: true, ...tempCreds.value };
  normalizePriority(config.value.priority);
  modalOpen.value = false;
  persist(`${activeProvider.value.label} connected`);
}

function disconnect(id: ProviderId) {
  config.value.providers[id] = { enabled: false, ...defaultCreds[id] };
  normalizePriority(config.value.priority);
  disconnectConfirm.value = null;
  persist(`${PROVIDERS.find((p) => p.id === id)?.label} disconnected`);
}

function setPrimary(id: ProviderId) {
  config.value.priority = [id, ...config.value.priority.filter((x) => x !== id)];
  config.value.primary = id;
  persist(`${PROVIDERS.find((p) => p.id === id)?.label} set as primary carrier`);
}

// Reorder the fallback chain (dir = -1 up / +1 down). primary tracks the head.
function moveInPriority(id: ProviderId, dir: -1 | 1) {
  const arr = [...config.value.priority];
  const i = arr.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  config.value.priority = arr;
  config.value.primary = arr[0] || '';
  persist('Carrier priority updated');
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="p-3">
      <UCard>
        <template #header>
          <div>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Shipping Integrations</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Connect one or more carriers. Your primary carrier is used for new orders automatically.</p>
          </div>
        </template>

        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl" />
          <p class="text-sm">Loading shipping settings…</p>
        </div>

        <template v-else>
        <!-- Carrier priority chain -->
        <Transition name="slide-down">
          <div
            v-if="orderedConnected.length"
            class="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
          >
            <div class="mb-3">
              <p class="text-sm font-semibold text-gray-700 dark:text-gray-200">Carrier Priority</p>
              <p class="text-xs text-gray-400">New shipments use the 1st carrier. At checkout, if it doesn't serve a pincode we fall back to the next, and so on.</p>
            </div>
            <div class="flex flex-col gap-2">
              <div
                v-for="(p, idx) in orderedConnected"
                :key="p.id"
                class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border"
                :class="idx === 0 ? 'border-primary-400 dark:border-primary-500' : 'border-gray-200 dark:border-gray-700'"
              >
                <span class="w-6 text-center text-sm font-bold text-gray-400">{{ idx + 1 }}</span>
                <span
                  class="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  :style="{ background: p.from }"
                >{{ p.abbr.slice(0, 2) }}</span>
                <span class="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ p.label }}</span>
                <UBadge v-if="idx === 0" color="primary" variant="subtle" size="xs">Primary</UBadge>
                <UBadge v-else color="gray" variant="subtle" size="xs">Fallback {{ idx }}</UBadge>
                <div class="flex items-center gap-0.5">
                  <UButton icon="i-heroicons-chevron-up" size="2xs" color="gray" variant="ghost" :disabled="idx === 0" @click="moveInPriority(p.id, -1)" />
                  <UButton icon="i-heroicons-chevron-down" size="2xs" color="gray" variant="ghost" :disabled="idx === orderedConnected.length - 1" @click="moveInPriority(p.id, 1)" />
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Provider grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <div
            v-for="provider in PROVIDERS"
            :key="provider.id"
            :class="[
              'group relative rounded-2xl overflow-hidden transition-all duration-200 flex flex-col',
              'bg-white dark:bg-gray-900',
              'border-2',
              isPrimary(provider.id) && isConnected(provider.id)
                ? 'border-primary-400 dark:border-primary-500 shadow-lg shadow-primary-100 dark:shadow-primary-900/30'
                : isConnected(provider.id)
                  ? 'border-green-300 dark:border-green-700 shadow-md'
                  : 'border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700',
            ]"
          >
            <!-- Gradient header -->
            <div
              class="relative h-[80px] flex items-center px-5 gap-3 overflow-hidden"
              :style="{ background: `linear-gradient(135deg, ${provider.from} 0%, ${provider.to} 100%)` }"
            >
              <!-- Decorative circles -->
              <div class="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
              <div class="absolute right-8 top-8 w-12 h-12 rounded-full bg-white/5 pointer-events-none" />

              <!-- Logo -->
              <div class="relative z-10 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white bg-white/20 border border-white/25 shrink-0 shadow">
                {{ provider.abbr }}
              </div>

              <!-- Name + type -->
              <div class="relative z-10 flex-1 min-w-0">
                <h3 class="font-bold text-white text-base leading-tight">{{ provider.label }}</h3>
                <p class="text-white/60 text-xs">{{ provider.type }}</p>
              </div>

              <!-- Status badges -->
              <div class="relative z-10 flex flex-col items-end gap-1 shrink-0">
                <div v-if="isPrimary(provider.id) && isConnected(provider.id)"
                     class="flex items-center gap-1 bg-white/20 border border-white/25 rounded-full px-2 py-0.5">
                  <UIcon name="i-heroicons-star-solid" class="text-yellow-300 text-[10px]" />
                  <span class="text-white text-[10px] font-bold">Primary</span>
                </div>
                <div v-else-if="isConnected(provider.id)"
                     class="flex items-center gap-1 bg-white/15 border border-white/20 rounded-full px-2 py-0.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span class="text-white text-[10px] font-semibold">Connected</span>
                </div>
                <div v-if="provider.testSupport"
                     class="flex items-center gap-0.5 text-white/50 text-[10px]">
                  <UIcon name="i-heroicons-beaker" class="text-[10px]" />Test
                </div>
              </div>
            </div>

            <!-- Card body -->
            <div class="p-5 flex flex-col gap-3 flex-1">
              <!-- Coverage chip -->
              <div class="flex items-center gap-1.5">
                <UIcon name="i-heroicons-map-pin" class="text-gray-400 text-xs shrink-0" />
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ provider.coverage }}</span>
              </div>

              <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{{ provider.tagline }}</p>

              <!-- Feature chips -->
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="f in provider.features"
                  :key="f"
                  class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  {{ f }}
                </span>
              </div>

              <UDivider class="mt-auto" />

              <!-- Actions -->
              <div class="flex items-center gap-2">
                <UButton
                  size="sm"
                  variant="outline"
                  color="gray"
                  icon="i-heroicons-cog-6-tooth"
                  class="flex-1"
                  @click="openConfigure(provider)"
                >
                  {{ isConnected(provider.id) ? 'Edit' : 'Connect' }}
                </UButton>

                <UButton
                  v-if="isConnected(provider.id) && !isPrimary(provider.id)"
                  size="sm"
                  icon="i-heroicons-star"
                  variant="soft"
                  color="primary"
                  class="flex-1"
                  @click="setPrimary(provider.id)"
                >
                  Set Primary
                </UButton>

                <UButton
                  v-if="isConnected(provider.id)"
                  size="sm"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  @click="disconnectConfirm = provider.id"
                />
              </div>

              <!-- Disconnect confirmation inline -->
              <Transition name="fade">
                <div
                  v-if="disconnectConfirm === provider.id"
                  class="mt-1 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                >
                  <p class="text-xs text-red-600 dark:text-red-400 mb-2 font-medium">Disconnect {{ provider.label }}?</p>
                  <div class="flex gap-2">
                    <UButton size="xs" color="red" class="flex-1" @click="disconnect(provider.id)">Yes, disconnect</UButton>
                    <UButton size="xs" variant="ghost" color="gray" class="flex-1" @click="disconnectConfirm = null">Cancel</UButton>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </div>

          <p class="mt-6 text-xs text-gray-400 flex items-center gap-1.5">
            <UIcon name="i-heroicons-information-circle" />
            You can connect multiple carriers and switch the primary anytime without losing settings.
          </p>
        </template>
      </UCard>
    </div>
  </UDashboardPanelContent>

  <!-- Configure / Connect modal -->
  <UModal v-model="modalOpen" :ui="{ width: 'sm:max-w-lg' }" prevent-close>
    <UCard v-if="activeProvider" :ui="{ body: { padding: 'p-0' }, header: { padding: 'p-0' }, footer: { padding: 'px-6 py-4' } }">
      <!-- Modal header -->
      <template #header>
        <div
          class="relative h-[72px] flex items-center px-6 gap-4 overflow-hidden rounded-t-xl"
          :style="{ background: `linear-gradient(135deg, ${activeProvider.from}, ${activeProvider.to})` }"
        >
          <div class="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
          <div class="relative z-10 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white bg-white/20 border border-white/25 shrink-0">
            {{ activeProvider.abbr }}
          </div>
          <div class="relative z-10 flex-1">
            <p class="font-bold text-white">{{ activeProvider.label }}</p>
            <p class="text-white/60 text-xs">{{ activeProvider.type }} · API credentials</p>
          </div>
          <UButton icon="i-heroicons-x-mark" color="white" variant="ghost" size="sm" @click="modalOpen = false" />
        </div>
      </template>

      <!-- Fields -->
      <div class="px-6 py-5 space-y-4">
        <template v-for="field in activeProvider.fields" :key="field.key">
          <UFormGroup :label="field.label">
            <USelect
              v-if="field.options"
              v-model="tempCreds[field.key]"
              :options="field.options"
            />
            <UInput
              v-else
              v-model="tempCreds[field.key]"
              :type="field.type || 'text'"
              :placeholder="field.placeholder || (field.type === 'password' ? '••••••••••••••••' : '')"
            />
            <template v-if="field.help" #help>
              <span class="text-gray-400 text-xs">{{ field.help }}</span>
            </template>
          </UFormGroup>
        </template>

        <!-- Test result -->
        <Transition name="fade">
          <div
            v-if="testStatus !== 'idle'"
            :class="[
              'flex items-center gap-2 px-3 py-2.5 rounded-lg border',
              testStatus === 'ok'    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' :
              testStatus === 'error' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' :
                                       'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
            ]"
          >
            <UIcon
              :name="testStatus === 'testing' ? 'i-heroicons-arrow-path' : testStatus === 'ok' ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              :class="[
                'text-base shrink-0',
                testStatus === 'testing' ? 'animate-spin text-gray-400' :
                testStatus === 'ok'      ? 'text-green-500' : 'text-red-500',
              ]"
            />
            <p :class="[
              'text-xs font-medium',
              testStatus === 'ok'    ? 'text-green-700 dark:text-green-300' :
              testStatus === 'error' ? 'text-red-700 dark:text-red-300' : 'text-gray-500',
            ]">
              {{ testStatus === 'testing' ? 'Testing connection…' : testMessage }}
            </p>
          </div>
        </Transition>

        <div class="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
          <UIcon name="i-heroicons-shield-check" class="text-amber-500 shrink-0 mt-0.5" />
          <p class="text-xs text-amber-700 dark:text-amber-300">Credentials are stored securely and never exposed to customers.</p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <UButton
              variant="ghost"
              color="gray"
              icon="i-heroicons-signal"
              :loading="testStatus === 'testing'"
              :disabled="!isFormValid || testStatus === 'testing'"
              @click="testConnection"
            >
              Test Connection
            </UButton>
            <a
              :href="activeProvider.docsUrl"
              target="_blank"
              rel="noopener"
              class="text-xs text-gray-400 hover:text-primary-500 flex items-center gap-1 transition-colors"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" />
              Docs
            </a>
          </div>
          <div class="flex gap-2">
            <UButton variant="ghost" color="gray" @click="modalOpen = false">Cancel</UButton>
            <UButton :loading="isSaving" :disabled="!isFormValid" icon="i-heroicons-link" @click="saveCredentials">Save & Connect</UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: all 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
