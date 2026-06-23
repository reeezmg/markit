<script setup lang="ts">
import { useFindFirstGeneralPreference, useUpsertGeneralPreference } from '~/lib/hooks';

definePageMeta({ auth: true });

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

const PAGE_NAME = 'ecomm_payment';
const PREF_KEY  = 'gateway_config';

type GatewayId = 'razorpay' | 'cashfree' | 'phonepe' | 'payu' | 'paytm';

const GATEWAYS: Array<{
  id: GatewayId; label: string; abbr: string; tagline: string;
  from: string; to: string;
  features: string[];
  fields: Array<{ key: string; label: string; type?: string; help?: string; placeholder?: string; options?: { label: string; value: string }[] }>
}> = [
  {
    id: 'razorpay', label: 'Razorpay', abbr: 'RZP',
    tagline: 'India\'s most trusted payment gateway with 100+ payment methods.',
    from: '#2563EB', to: '#1d4ed8',
    features: ['UPI', 'Cards', 'Wallets', 'NetBanking', 'EMI', 'BNPL'],
    fields: [
      { key: 'keyId',         label: 'Key ID',         placeholder: 'rzp_live_xxxxxxxxxxxx', help: 'Dashboard → Settings → API Keys' },
      { key: 'keySecret',     label: 'Key Secret',     type: 'password' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'Optional — needed only to verify webhook events', help: 'Dashboard → Webhooks → Add New Webhook' },
    ],
  },
  {
    id: 'cashfree', label: 'Cashfree', abbr: 'CF',
    tagline: 'Lowest transaction fees with instant settlement to your bank.',
    from: '#0d9488', to: '#0f766e',
    features: ['UPI', 'Cards', 'Wallets', 'BNPL', 'Pay Later'],
    fields: [
      { key: 'appId',      label: 'App ID',     help: 'Dashboard → Developers → API Keys' },
      { key: 'secretKey',  label: 'Secret Key', type: 'password' },
      { key: 'environment', label: 'Environment', options: [{ label: 'Production', value: 'PROD' }, { label: 'Test / Sandbox', value: 'TEST' }] },
    ],
  },
  {
    id: 'phonepe', label: 'PhonePe', abbr: 'PP',
    tagline: '500M+ users. Largest UPI network with seamless payment experience.',
    from: '#7c3aed', to: '#6d28d9',
    features: ['UPI', 'PhonePe Wallet', 'Cards', 'Net Banking'],
    fields: [
      { key: 'merchantId', label: 'Merchant ID', help: 'Business Dashboard → Developers → Integrate' },
      { key: 'saltKey',    label: 'Salt Key',    type: 'password' },
      { key: 'saltIndex',  label: 'Salt Index',  placeholder: '1', help: 'Usually 1 unless specified otherwise' },
      { key: 'environment', label: 'Environment', options: [{ label: 'Production', value: 'PROD' }, { label: 'UAT / Staging', value: 'UAT' }] },
    ],
  },
  {
    id: 'payu', label: 'PayU', abbr: 'PU',
    tagline: 'Trusted by 4.5 lakh+ businesses with advanced fraud protection.',
    from: '#1e3a8a', to: '#1e40af',
    features: ['UPI', 'Cards', 'NetBanking', 'Wallets', 'EMI'],
    fields: [
      { key: 'merchantKey',  label: 'Merchant Key',  help: 'Dashboard → My Account → Merchant Details' },
      { key: 'merchantSalt', label: 'Merchant Salt', type: 'password' },
      { key: 'environment',  label: 'Environment',   options: [{ label: 'Production', value: 'PROD' }, { label: 'Test', value: 'TEST' }] },
    ],
  },
  {
    id: 'paytm', label: 'Paytm', abbr: 'PTM',
    tagline: '300M+ Paytm users. Accept Paytm wallet, UPI, cards and more.',
    from: '#0284c7', to: '#0369a1',
    features: ['UPI', 'Paytm Wallet', 'Cards', 'NetBanking', 'EMI'],
    fields: [
      { key: 'merchantId',     label: 'Merchant ID',      help: 'Paytm for Business → Developer Settings' },
      { key: 'merchantKey',    label: 'Merchant Key',     type: 'password' },
      { key: 'website',        label: 'Website',          placeholder: 'DEFAULT', help: 'DEFAULT for production, WEBSTAGING for test' },
      { key: 'channelId',      label: 'Channel ID',       options: [{ label: 'WEB (Desktop)', value: 'WEB' }, { label: 'WAP (Mobile)', value: 'WAP' }] },
      { key: 'industryTypeId', label: 'Industry Type',    placeholder: 'Retail' },
      { key: 'environment',    label: 'Environment',      options: [{ label: 'Production', value: 'PROD' }, { label: 'Staging', value: 'STAGING' }] },
    ],
  },
];

const defaultCreds: Record<GatewayId, Record<string, string>> = {
  razorpay: { keyId: '', keySecret: '', webhookSecret: '' },
  cashfree: { appId: '', secretKey: '', environment: 'PROD' },
  phonepe:  { merchantId: '', saltKey: '', saltIndex: '1', environment: 'PROD' },
  payu:     { merchantKey: '', merchantSalt: '', environment: 'PROD' },
  paytm:    { merchantId: '', merchantKey: '', website: 'DEFAULT', channelId: 'WEB', industryTypeId: 'Retail', environment: 'PROD' },
};

interface PaymentConfig {
  gateway: GatewayId;
  enabled: boolean;
  razorpay: Record<string, string>;
  cashfree:  Record<string, string>;
  phonepe:   Record<string, string>;
  payu:      Record<string, string>;
  paytm:     Record<string, string>;
}

const config = ref<PaymentConfig>({
  gateway: 'razorpay', enabled: false,
  ...JSON.parse(JSON.stringify(defaultCreds)),
});

const modalOpen     = ref(false);
const activeGateway = ref<typeof GATEWAYS[0] | null>(null);
const tempCreds     = ref<Record<string, string>>({});
const testStatus       = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
const testMessage      = ref('');
const webhookGuideOpen = ref(false);

const { data: prefData, isLoading } = useFindFirstGeneralPreference({
  where: { companyId: companyId.value, pageName: PAGE_NAME, key: PREF_KEY },
});

watch(prefData, (val) => {
  if (val?.value) {
    const s = val.value as Partial<PaymentConfig>;
    config.value = {
      gateway: s.gateway || 'razorpay', enabled: s.enabled ?? false,
      razorpay: { ...defaultCreds.razorpay, ...(s.razorpay || {}) },
      cashfree:  { ...defaultCreds.cashfree,  ...(s.cashfree  || {}) },
      phonepe:   { ...defaultCreds.phonepe,   ...(s.phonepe   || {}) },
      payu:      { ...defaultCreds.payu,      ...(s.payu      || {}) },
      paytm:     { ...defaultCreds.paytm,     ...(s.paytm     || {}) },
    };
  }
}, { immediate: true });

const isConnected = (id: GatewayId) => {
  const skip = new Set(['PROD','TEST','UAT','STAGING','WEB','WAP','DEFAULT','Retail','1']);
  return Object.values(config.value[id]).some((v) => v && !skip.has(v));
};
const isActive = (id: GatewayId) => config.value.enabled && config.value.gateway === id && isConnected(id);

const isFormValid = computed(() => {
  if (!activeGateway.value) return false;
  return activeGateway.value.fields.every((f) => {
    if (f.options) return true;
    if (f.placeholder?.toLowerCase().includes('optional')) return true;
    return (tempCreds.value[f.key] ?? '').trim() !== '';
  });
});

function openConfigure(gw: typeof GATEWAYS[0]) {
  activeGateway.value = gw;
  tempCreds.value = { ...config.value[gw.id] };
  testStatus.value = 'idle';
  testMessage.value = '';
  webhookGuideOpen.value = false;
  modalOpen.value = true;
}

async function testConnection() {
  if (!activeGateway.value || !isFormValid.value) return;
  testStatus.value = 'testing';
  testMessage.value = '';
  try {
    const res = await $fetch<{ ok: boolean; message: string }>('/api/ecommerce-cms/payment/test', {
      method: 'POST',
      body: { gateway: activeGateway.value.id, credentials: tempCreds.value },
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

function setActive(id: GatewayId) {
  config.value.gateway = id;
  config.value.enabled = true;
  persist(`${GATEWAYS.find((g) => g.id === id)?.label} set as active gateway`);
}

async function saveCredentials() {
  if (!activeGateway.value || !isFormValid.value) return;
  if (testStatus.value !== 'ok') {
    await testConnection();
    if (testStatus.value !== 'ok') return;
  }
  const id = activeGateway.value.id;
  (config.value[id] as any) = { ...tempCreds.value };
  config.value.gateway = id;
  config.value.enabled = true;
  modalOpen.value = false;
  persist(`${activeGateway.value.label} is now active`);
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="p-3">
      <UCard>
        <template #header>
          <div>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Payment Gateways</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Configure a gateway — it becomes active immediately after saving credentials.</p>
          </div>
        </template>

        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl" />
          <p class="text-sm">Loading payment settings…</p>
        </div>

        <template v-else>
        <!-- Active banner -->
        <Transition name="fade">
          <div
            v-if="config.enabled && isConnected(config.gateway)"
            class="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50"
          >
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900">
              <UIcon name="i-heroicons-check-badge" class="text-green-600 dark:text-green-400 text-lg" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-green-800 dark:text-green-200">
                Payments live via <strong>{{ GATEWAYS.find((g) => g.id === config.gateway)?.label }}</strong>
              </p>
              <p class="text-xs text-green-600 dark:text-green-400">Customers can now complete purchases online</p>
            </div>
            <UButton size="xs" variant="ghost" color="green" icon="i-heroicons-x-mark" @click="config.enabled = false; persist()" />
          </div>
        </Transition>

        <!-- Gateway cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <div
            v-for="gw in GATEWAYS"
            :key="gw.id"
            :class="[
              'group relative rounded-2xl overflow-hidden transition-all duration-200 cursor-default flex flex-col',
              'bg-white dark:bg-gray-900',
              'border-2',
              isActive(gw.id)
                ? 'border-primary-400 dark:border-primary-500 shadow-lg shadow-primary-100 dark:shadow-primary-900/30'
                : isConnected(gw.id)
                  ? 'border-green-300 dark:border-green-700 shadow-md'
                  : 'border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700',
            ]"
          >
            <!-- Active glow ring -->
            <div
              v-if="isActive(gw.id)"
              class="absolute inset-0 rounded-2xl pointer-events-none"
              :style="{ boxShadow: `inset 0 0 0 2px ${gw.from}33` }"
            />

            <!-- Gradient header -->
            <div
              class="relative h-[88px] flex items-center px-5 gap-4 overflow-hidden"
              :style="{ background: `linear-gradient(135deg, ${gw.from} 0%, ${gw.to} 100%)` }"
            >
              <!-- Decorative bg circles -->
              <div class="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
              <div class="absolute right-8 top-8 w-14 h-14 rounded-full bg-white/5 pointer-events-none" />

              <!-- Logo -->
              <div class="relative z-10 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm text-white bg-white/20 border border-white/25 shadow backdrop-blur-sm shrink-0">
                {{ gw.abbr }}
              </div>

              <!-- Name -->
              <div class="relative z-10 flex-1 min-w-0">
                <h3 class="font-bold text-white text-lg leading-tight tracking-tight">{{ gw.label }}</h3>
                <p class="text-white/60 text-xs mt-0.5">Payment Gateway</p>
              </div>

              <!-- Status pill -->
              <div class="relative z-10 shrink-0">
                <div v-if="isActive(gw.id)" class="flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-full px-2.5 py-1">
                  <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-sm shadow-green-400" />
                  <span class="text-white text-xs font-semibold">Live</span>
                </div>
                <div v-else-if="isConnected(gw.id)" class="flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-full px-2.5 py-1">
                  <UIcon name="i-heroicons-check" class="text-white text-xs" />
                  <span class="text-white text-xs font-medium">Connected</span>
                </div>
              </div>
            </div>

            <!-- Card body -->
            <div class="p-5 flex flex-col gap-4 flex-1">
              <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{{ gw.tagline }}</p>

              <!-- Feature chips -->
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="f in gw.features"
                  :key="f"
                  class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  {{ f }}
                </span>
              </div>

              <!-- Test mode note -->
              <p class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                <UIcon name="i-heroicons-beaker" class="shrink-0" />
                <span>Test / sandbox mode available</span>
              </p>

              <UDivider class="mt-auto" />

              <!-- Actions -->
              <div class="flex items-center gap-2">
                <UButton
                  size="sm"
                  variant="outline"
                  color="gray"
                  icon="i-heroicons-cog-6-tooth"
                  class="flex-1"
                  @click="openConfigure(gw)"
                >
                  {{ isConnected(gw.id) ? 'Edit Config' : 'Configure' }}
                </UButton>

                <template v-if="!isActive(gw.id)">
                  <UButton
                    v-if="isConnected(gw.id)"
                    size="sm"
                    icon="i-heroicons-bolt"
                    variant="soft"
                    color="primary"
                    class="flex-1"
                    @click="setActive(gw.id)"
                  >
                    Switch to this
                  </UButton>
                </template>
                <template v-else>
                  <div class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-400 text-sm font-semibold">
                    <UIcon name="i-heroicons-check-circle" />
                    Active
                  </div>
                </template>
              </div>

              <!-- Hint if not configured yet -->
              <p v-if="!isConnected(gw.id)" class="text-[11px] text-gray-400 text-center -mt-1">
                Fill in credentials to activate this gateway
              </p>
            </div>
          </div>
        </div>

          <p class="mt-6 text-xs text-gray-400 flex items-center gap-1.5">
            <UIcon name="i-heroicons-lock-closed" />
            Credentials are stored securely and never exposed to customers.
          </p>
        </template>
      </UCard>
    </div>
  </UDashboardPanelContent>

  <!-- Configure modal -->
  <UModal v-model="modalOpen" :ui="{ width: 'sm:max-w-lg' }" prevent-close>
    <UCard v-if="activeGateway" :ui="{ body: { padding: 'p-0' }, header: { padding: 'p-0' }, footer: { padding: 'px-6 py-4' } }">
      <!-- Modal header with gradient -->
      <template #header>
        <div
          class="relative h-20 flex items-center px-6 gap-4 overflow-hidden rounded-t-xl"
          :style="{ background: `linear-gradient(135deg, ${activeGateway.from}, ${activeGateway.to})` }"
        >
          <div class="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
          <div
            class="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white bg-white/20 border border-white/25 shrink-0"
          >
            {{ activeGateway.abbr }}
          </div>
          <div class="flex-1">
            <p class="font-bold text-white text-base">{{ activeGateway.label }}</p>
            <p class="text-white/60 text-xs">Enter your API credentials</p>
          </div>
          <UButton icon="i-heroicons-x-mark" color="white" variant="ghost" size="sm" @click="modalOpen = false" />
        </div>
      </template>

      <!-- Fields -->
      <div class="px-6 py-5 space-y-4">
        <template v-for="field in activeGateway.fields" :key="field.key">
          <UFormGroup :label="field.label">
            <template v-if="field.key === 'webhookSecret'" #label>
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ field.label }}</span>
                <button
                  type="button"
                  class="text-green-500 hover:text-green-600 transition-colors"
                  title="What is a webhook and why is it needed?"
                  @click="webhookGuideOpen = !webhookGuideOpen"
                >
                  <UIcon name="i-heroicons-information-circle" class="text-base" />
                </button>
              </div>
            </template>

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
            <template v-if="field.key === 'webhookSecret'" #help>
              <div class="flex items-center gap-1.5 mt-1 bg-gray-100 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                <code class="text-[11px] text-gray-600 dark:text-gray-300 flex-1 break-all select-all">https://api.markit.co.in/api/payment/{{ companyId }}/webhook/razorpay</code>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="gray"
                  icon="i-heroicons-clipboard-document"
                  :ui="{ rounded: 'rounded-md' }"
                  @click="() => { navigator.clipboard.writeText(`https://api.markit.co.in/api/payment/${companyId}/webhook/razorpay`); toast.add({ title: 'Webhook URL copied', color: 'green', timeout: 1500 }) }"
                />
              </div>
            </template>
            <template v-else-if="field.help" #help>
              <span class="text-gray-400 text-xs">{{ field.help }}</span>
            </template>
          </UFormGroup>

          <!-- Webhook guide (Razorpay only) -->
          <Transition name="fade">
            <div
              v-if="field.key === 'webhookSecret' && webhookGuideOpen"
              class="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3"
            >
              <p class="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <UIcon name="i-heroicons-information-circle" class="text-green-500" />
                What is a Webhook &amp; why is it needed?
              </p>
              <p class="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                Payments work fine without this. A webhook is an optional safety net — if the customer pays but the app crashes or loses internet before confirming the order, Razorpay will still notify your server and the order gets marked as paid automatically. Recommended for production.
              </p>
              <UDivider />
              <p class="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <UIcon name="i-heroicons-academic-cap" />
                How to set it up
              </p>

              <!-- Pre-filled webhook URL for this company -->
              <div class="space-y-1">
                <p class="text-[11px] font-medium text-blue-600 dark:text-blue-400">Your Webhook URL</p>
                <div class="flex items-center gap-2 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2">
                  <code class="text-[11px] text-gray-700 dark:text-gray-300 flex-1 break-all select-all">
                    https://api.markit.co.in/api/payment/{{ companyId }}/webhook/razorpay
                  </code>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="gray"
                    icon="i-heroicons-clipboard"
                    @click="() => navigator.clipboard.writeText(`https://api.markit.co.in/api/payment/${companyId}/webhook/razorpay`)"
                  />
                </div>
                <p class="text-[11px] text-blue-500 dark:text-blue-400">This URL is unique to your account. Paste it directly into Razorpay.</p>
              </div>

              <ol class="space-y-2 text-xs text-blue-700 dark:text-blue-300 list-none">
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">1</span>Log in to <strong>Razorpay Dashboard</strong></li>
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">2</span>Go to <strong>Settings → Webhooks</strong></li>
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">3</span>Click <strong>+ Add New Webhook</strong></li>
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">4</span>Paste the <strong>Webhook URL</strong> above into the URL field</li>
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">5</span>Set a <strong>Secret</strong> (any random string) — enter the same value in the field above</li>
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">6</span>Under <strong>Active Events</strong>, enable: <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">payment.captured</code> <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">payment.failed</code></li>
                <li class="flex gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center font-bold text-[10px]">7</span>Click <strong>Create Webhook</strong></li>
              </ol>
            </div>
          </Transition>
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
          <p class="text-xs text-amber-700 dark:text-amber-300">Secret keys are stored encrypted. Never share them with anyone.</p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between items-center">
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
          <div class="flex gap-2">
            <UButton variant="ghost" color="gray" @click="modalOpen = false">Cancel</UButton>
            <UButton
              :loading="testStatus === 'testing' || isSaving"
              :disabled="!isFormValid || testStatus === 'testing'"
              icon="i-heroicons-bolt"
              @click="saveCredentials"
            >
              {{ testStatus === 'testing' ? 'Verifying…' : testStatus === 'ok' ? 'Activate' : 'Test & Activate' }}
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: all 0.25s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
