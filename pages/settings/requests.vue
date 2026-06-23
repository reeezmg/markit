<script setup lang="ts">
import { useFindFirstGeneralPreference, useUpsertGeneralPreference } from '~/lib/hooks';

definePageMeta({ auth: true });

type RequestKey = 'cancellation' | 'return' | 'exchange';

type RequestRule = {
  enabled: boolean;
  windowHours: number;
  condition: string;
  autoApprove: boolean;
  requireReason: boolean;
  requireImages: boolean;
  pickupRequired: boolean;
  refundMode: string;
  feeType: string;
  feeValue: number;
  reasonOptions: string[];
};

type RequestSettings = Record<RequestKey, RequestRule> & {
  notifyCustomer: boolean;
  allowPartialItemRequests: boolean;
};

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

const pageName = 'ecommerce_requests';
const preferenceKey = 'request_rules';

const defaultSettings: RequestSettings = {
  cancellation: {
    enabled: true,
    windowHours: 2,
    condition: 'before_packed',
    autoApprove: true,
    requireReason: true,
    requireImages: false,
    pickupRequired: false,
    refundMode: 'original_payment',
    feeType: 'none',
    feeValue: 0,
    reasonOptions: ['Ordered by mistake', 'Found a better price', 'Changing my order', 'Delivery taking too long'],
  },
  return: {
    enabled: true,
    windowHours: 168,
    condition: 'after_delivered',
    autoApprove: false,
    requireReason: true,
    requireImages: true,
    pickupRequired: true,
    refundMode: 'original_payment',
    feeType: 'none',
    feeValue: 0,
    reasonOptions: ['Item damaged', 'Wrong item received', 'Size or fit issue', 'Not as described', 'Quality not satisfactory'],
  },
  exchange: {
    enabled: true,
    windowHours: 168,
    condition: 'after_delivered',
    autoApprove: false,
    requireReason: true,
    requireImages: true,
    pickupRequired: true,
    refundMode: 'replacement_only',
    feeType: 'none',
    feeValue: 0,
    reasonOptions: ['Wrong size', 'Wrong colour or variant', 'Defective item'],
  },
  notifyCustomer: true,
  allowPartialItemRequests: true,
};

const conditionOptions = [
  { label: 'Before packed', value: 'before_packed' },
  { label: 'Before shipped', value: 'before_shipped' },
  { label: 'Before out for delivery', value: 'before_out_for_delivery' },
  { label: 'After delivered', value: 'after_delivered' },
  { label: 'After approval', value: 'after_approval' },
  { label: 'Manual review only', value: 'manual_review' },
];

// Settlement modes are scoped per request type — only the modes that make sense
// for that request are offered (not one shared list).
// Settlement modes are scoped per request type. "Manual review" is intentionally
// not a settlement mode — turning Auto approve off already means manual review.
const refundModeOptionsByType: Record<RequestKey, { label: string; value: string }[]> = {
  cancellation: [
    { label: 'Original payment', value: 'original_payment' },
    { label: 'Store credit', value: 'store_credit' },
    { label: 'No refund', value: 'no_refund' },
  ],
  return: [
    { label: 'Original payment', value: 'original_payment' },
    { label: 'Store credit', value: 'store_credit' },
  ],
  exchange: [
    { label: 'Replacement only', value: 'replacement_only' },
    { label: 'Store credit (price difference)', value: 'store_credit' },
  ],
};

const feeOptions = [
  { label: 'No fee', value: 'none' },
  { label: 'Flat fee', value: 'flat' },
  { label: 'Percentage fee', value: 'percentage' },
];

const sections: { key: RequestKey; title: string; description: string }[] = [
  {
    key: 'cancellation',
    title: 'Cancellation requests',
    description: 'Controls when customers can cancel before fulfillment starts.',
  },
  {
    key: 'return',
    title: 'Return requests',
    description: 'Controls post-delivery returns, inspection, pickup, and proof rules.',
  },
  {
    key: 'exchange',
    title: 'Exchange requests',
    description: 'Controls replacement requests and stock-dependent exchange rules.',
  },
];

const cloneSettings = (value: RequestSettings) => JSON.parse(JSON.stringify(value)) as RequestSettings;
const settings = reactive<RequestSettings>(cloneSettings(defaultSettings));
const isSaving = ref(false);

// Draft inputs for adding a new reason option, one per request type.
const newReason = reactive<Record<RequestKey, string>>({
  cancellation: '', return: '', exchange: '',
});

function addReason(key: RequestKey) {
  const value = (newReason[key] || '').trim();
  if (!value) return;
  if (!settings[key].reasonOptions.includes(value)) settings[key].reasonOptions.push(value);
  newReason[key] = '';
}
function removeReason(key: RequestKey, index: number) {
  settings[key].reasonOptions.splice(index, 1);
}

// Surface the store-credit manager whenever a request settles to store credit.
const usesStoreCredit = computed(() =>
  sections.some((section) => settings[section.key].refundMode === 'store_credit'),
);

// Merge a saved preference onto defaults safely: deep-merge each request type so
// older saved rows that predate new fields (reasonOptions) still get them, and
// drop any settlement mode that is no longer offered.
function mergeSaved(saved: Partial<RequestSettings>): RequestSettings {
  const merged: any = { ...defaultSettings, ...saved };
  for (const { key } of sections) {
    merged[key] = { ...defaultSettings[key], ...((saved as any)?.[key] || {}) };
    if (!Array.isArray(merged[key].reasonOptions)) {
      merged[key].reasonOptions = [...defaultSettings[key].reasonOptions];
    }
    const validModes = refundModeOptionsByType[key].map((option) => option.value);
    if (!validModes.includes(merged[key].refundMode)) {
      merged[key].refundMode = defaultSettings[key].refundMode;
    }
  }
  return merged as RequestSettings;
}

const { data: savedPreference, refetch } = useFindFirstGeneralPreference(
  computed(() => ({
    where: {
      companyId: companyId.value,
      pageName,
      key: preferenceKey,
      active: true,
    },
  })),
  { enabled: computed(() => Boolean(companyId.value)) },
);

const UpsertPreference = useUpsertGeneralPreference({ optimisticUpdate: true });

watch(
  savedPreference,
  (preference) => {
    if (!preference?.value) return;
    Object.assign(settings, cloneSettings(mergeSaved(preference.value as Partial<RequestSettings>)));
  },
  { immediate: true },
);

const saveSettings = async () => {
  if (!companyId.value) return;
  isSaving.value = true;
  try {
    await UpsertPreference.mutateAsync({
      where: {
        companyId_pageName_key: {
          companyId: companyId.value,
          pageName,
          key: preferenceKey,
        },
      },
      create: {
        pageName,
        key: preferenceKey,
        value: cloneSettings(settings),
        active: true,
        company: { connect: { id: companyId.value } },
      },
      update: {
        value: cloneSettings(settings),
        active: true,
      },
    } as any);
    await refetch();
    toast.add({ title: 'Request settings saved', icon: 'i-heroicons-check-circle' });
  } catch (error: any) {
    toast.add({
      title: 'Could not save request settings',
      description: error?.statusMessage || error?.message,
      color: 'red',
      icon: 'i-heroicons-x-circle',
    });
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>

  <UDashboardPanelContent class="pb-24">
    <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Request settings</h1>
        <p class="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Configure when customers can cancel, return, or exchange ecommerce orders, and how refunds are settled.
        </p>
      </div>
      <UButton
        icon="i-heroicons-check"
        :loading="isSaving"
        @click="saveSettings"
      >
        Save settings
      </UButton>
    </div>

    <div class="mb-6 grid gap-4 md:grid-cols-2">
      <UCard>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Notify customer on status changes</p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Send updates when requests are approved, rejected, picked up, or refunded.</p>
          </div>
          <UToggle v-model="settings.notifyCustomer" />
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Allow item-level requests</p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Customers can request return/exchange for selected items instead of the whole order.</p>
          </div>
          <UToggle v-model="settings.allowPartialItemRequests" />
        </div>
      </UCard>
    </div>

    <div class="space-y-5">
      <UCard v-for="section in sections" :key="section.key">
        <div class="mb-5 flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ section.title }}</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ section.description }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500 dark:text-gray-400">{{ settings[section.key].enabled ? 'Enabled' : 'Disabled' }}</span>
            <UToggle v-model="settings[section.key].enabled" />
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UFormGroup label="Accepted until / from">
            <USelectMenu
              v-model="settings[section.key].condition"
              :options="conditionOptions"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>

          <UFormGroup label="Request window">
            <UInput
              v-model.number="settings[section.key].windowHours"
              type="number"
              min="0"
              trailing
            >
              <template #trailing>
                <span class="text-xs text-gray-500">hours</span>
              </template>
            </UInput>
          </UFormGroup>

          <UFormGroup label="Refund / settlement mode">
            <USelectMenu
              v-model="settings[section.key].refundMode"
              :options="refundModeOptionsByType[section.key]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>

          <UFormGroup label="Fee type">
            <USelectMenu
              v-model="settings[section.key].feeType"
              :options="feeOptions"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>

          <UFormGroup label="Fee value">
            <UInput
              v-model.number="settings[section.key].feeValue"
              type="number"
              min="0"
              :disabled="settings[section.key].feeType === 'none'"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-3 xl:col-span-1">
            <label class="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              Auto approve
              <UToggle v-model="settings[section.key].autoApprove" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              Reason
              <UToggle v-model="settings[section.key].requireReason" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              Images
              <UToggle v-model="settings[section.key].requireImages" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              Pickup
              <UToggle v-model="settings[section.key].pickupRequired" />
            </label>
          </div>
        </div>

        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          When <strong>Auto approve</strong> is off, these requests go to manual review before they are actioned.
        </p>

        <!-- Reason options shown to the customer in the app (when Reason is required) -->
        <div v-if="settings[section.key].requireReason" class="mt-4 rounded-md border border-gray-200 p-4 dark:border-gray-800">
          <p class="text-sm font-medium text-gray-900 dark:text-white">Reason options</p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Customers pick one of these in the app. An <strong>“Other”</strong> choice is always added automatically — selecting it lets them type their own reason.
          </p>
          <div class="mt-3 flex flex-col gap-2">
            <div
              v-for="(reason, i) in settings[section.key].reasonOptions"
              :key="i"
              class="flex items-center gap-2"
            >
              <UInput v-model="settings[section.key].reasonOptions[i]" class="flex-1" />
              <UButton
                color="red"
                variant="ghost"
                icon="i-heroicons-trash"
                square
                @click="removeReason(section.key, i)"
              />
            </div>
            <div class="flex items-center gap-2">
              <UInput
                v-model="newReason[section.key]"
                placeholder="Add a reason option"
                class="flex-1"
                @keyup.enter="addReason(section.key)"
              />
              <UButton icon="i-heroicons-plus" @click="addReason(section.key)">Add</UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Store credit management — shown when any request settles to store credit -->
    <div v-if="usesStoreCredit" class="mt-6">
      <SettingsStoreCredit />
    </div>
  </UDashboardPanelContent>
</template>
