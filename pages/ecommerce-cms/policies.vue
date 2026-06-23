<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
import { useFindFirstGeneralPreference, useUpsertGeneralPreference } from '~/lib/hooks';

type Policy = {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: boolean;
  required: boolean;
};

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();

const companyId = computed(() => useAuth().session.value?.companyId || '');
const pageName = 'ecommerce_policies';
const preferenceKey = 'policies';

const defaultPolicies: Policy[] = [
  {
    id: 'refund-policy',
    title: 'Refund Policy',
    slug: 'refund-policy',
    status: true,
    required: true,
    content: 'Refunds are processed after the request is approved and the returned item is inspected, where applicable.',
  },
  {
    id: 'return-policy',
    title: 'Return Policy',
    slug: 'return-policy',
    status: true,
    required: true,
    content: 'Returns are accepted within the configured return window for eligible items in unused condition.',
  },
  {
    id: 'terms-and-conditions',
    title: 'Terms and Conditions',
    slug: 'terms-and-conditions',
    status: true,
    required: true,
    content: 'By placing an order, customers agree to the store terms, order confirmation process, and applicable policies.',
  },
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    status: true,
    required: true,
    content: 'Customer information is used to process orders, provide support, and improve the shopping experience.',
  },
  {
    id: 'cookies-policy',
    title: 'Cookies Policy',
    slug: 'cookies-policy',
    status: true,
    required: true,
    content: 'Cookies and similar technologies may be used to keep sessions active and improve storefront performance.',
  },
  {
    id: 'shipping-policy',
    title: 'Shipping Policy',
    slug: 'shipping-policy',
    status: true,
    required: true,
    content: 'Shipping timelines depend on delivery availability, order confirmation, and the customer address.',
  },
  {
    id: 'cancellation-policy',
    title: 'Cancellation Policy',
    slug: 'cancellation-policy',
    status: true,
    required: true,
    content: 'Orders can be cancelled only before fulfillment starts, unless the store approves an exception.',
  },
];

const policies = ref<Policy[]>(JSON.parse(JSON.stringify(defaultPolicies)));
const selectedId = ref(defaultPolicies[0].id);
const isSaving = ref(false);
const isAddingCustom = ref(false);
const customTitle = ref('');
const editorRef = ref<HTMLElement | null>(null);

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

const selectedPolicy = computed(() =>
  policies.value.find((policy) => policy.id === selectedId.value) || policies.value[0],
);

function syncEditor(event: Event) {
  if (selectedPolicy.value) {
    selectedPolicy.value.content = (event.currentTarget as HTMLElement).innerHTML;
  }
}

function setEditorContent() {
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.innerHTML = selectedPolicy.value?.content || '';
    }
  });
}

function format(command: string, value?: string) {
  document.execCommand(command, false, value);
  if (editorRef.value && selectedPolicy.value) {
    selectedPolicy.value.content = editorRef.value.innerHTML;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mergePolicies(saved: unknown) {
  if (!Array.isArray(saved)) return JSON.parse(JSON.stringify(defaultPolicies)) as Policy[];

  const savedPolicies = saved as Partial<Policy>[];
  const mergedStandard = defaultPolicies.map((policy) => {
    const match = savedPolicies.find((item) => item.id === policy.id || item.slug === policy.slug);
    return {
      ...policy,
      ...match,
      id: policy.id,
      slug: policy.slug,
      title: policy.title,
      required: true,
    };
  });

  const custom = savedPolicies
    .filter((policy) => policy.required === false)
    .map((policy) => ({
      id: policy.id || uuidv4(),
      title: policy.title || 'Custom Policy',
      slug: policy.slug || slugify(policy.title || 'custom-policy'),
      content: policy.content || '',
      status: policy.status ?? true,
      required: false,
    }));

  return [...mergedStandard, ...custom];
}

function addCustomPolicy() {
  const title = customTitle.value.trim();
  if (!title) {
    toast.add({ title: 'Policy title is required', color: 'red' });
    return;
  }

  const slug = slugify(title);
  const baseId = `custom-${slug || uuidv4()}`;
  const id = policies.value.some((policy) => policy.id === baseId)
    ? `${baseId}-${uuidv4().slice(0, 8)}`
    : baseId;
  policies.value.push({
    id,
    title,
    slug,
    content: '',
    status: true,
    required: false,
  });
  selectedId.value = id;
  setEditorContent();
  customTitle.value = '';
  isAddingCustom.value = false;
}

function removePolicy(policy: Policy) {
  if (policy.required) return;
  policies.value = policies.value.filter((item) => item.id !== policy.id);
  selectedId.value = policies.value[0]?.id || defaultPolicies[0].id;
}

async function savePolicies() {
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
        value: JSON.parse(JSON.stringify(policies.value)),
        active: true,
        company: { connect: { id: companyId.value } },
      },
      update: {
        value: JSON.parse(JSON.stringify(policies.value)),
        active: true,
      },
    } as any);
    await refetch();
    toast.add({ title: 'Policies saved', icon: 'i-heroicons-check-circle' });
  } catch (error: any) {
    toast.add({
      title: 'Unable to save policies',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
      icon: 'i-heroicons-x-circle',
    });
  } finally {
    isSaving.value = false;
  }
}

watch(
  savedPreference,
  (preference) => {
    policies.value = mergePolicies(preference?.value);
    if (!policies.value.some((policy) => policy.id === selectedId.value)) {
      selectedId.value = policies.value[0]?.id || defaultPolicies[0].id;
    }
    setEditorContent();
  },
  { immediate: true },
);

watch(selectedId, setEditorContent);
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="grid gap-4 p-3 xl:grid-cols-[360px_minmax(0,1fr)]">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Policies</h1>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Legal and ecommerce policy pages for the custom storefront.
              </p>
            </div>
            <UButton icon="i-heroicons-plus" color="gray" variant="soft" @click="isAddingCustom = true" />
          </div>
        </template>

        <div v-if="isAddingCustom" class="mb-4 rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <UFormGroup label="Custom policy title">
            <UInput v-model="customTitle" placeholder="Warranty Policy" @keydown.enter="addCustomPolicy" />
          </UFormGroup>
          <div class="mt-3 flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" @click="isAddingCustom = false" />
            <UButton label="Add" @click="addCustomPolicy" />
          </div>
        </div>

        <div class="space-y-2">
          <button
            v-for="policy in policies"
            :key="policy.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition"
            :class="selectedId === policy.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/30' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900'"
            @click="selectedId = policy.id"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ policy.title }}</p>
              <p class="truncate text-xs text-gray-500">/{{ policy.slug }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UBadge :color="policy.status ? 'green' : 'gray'" variant="subtle">
                {{ policy.status ? 'Live' : 'Hidden' }}
              </UBadge>
              <UButton
                v-if="!policy.required"
                color="red"
                variant="ghost"
                icon="i-heroicons-trash"
                @click.stop="removePolicy(policy)"
              />
            </div>
          </button>
        </div>
      </UCard>

      <UCard v-if="selectedPolicy">
        <template #header>
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ selectedPolicy.title }}</h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Slug: /{{ selectedPolicy.slug }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">{{ selectedPolicy.status ? 'Live' : 'Hidden' }}</span>
              <UToggle v-model="selectedPolicy.status" />
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <div v-if="!selectedPolicy.required" class="grid gap-4 md:grid-cols-2">
            <UFormGroup label="Title">
              <UInput v-model="selectedPolicy.title" />
            </UFormGroup>
            <UFormGroup label="Slug">
              <UInput v-model="selectedPolicy.slug" />
            </UFormGroup>
          </div>

          <UFormGroup label="Policy content">
            <div class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div class="flex flex-wrap gap-1 border-b border-gray-200 p-2 dark:border-gray-800">
                <UButton color="gray" variant="ghost" size="xs" label="H2" @click="format('formatBlock', 'h2')" />
                <UButton color="gray" variant="ghost" size="xs" label="H3" @click="format('formatBlock', 'h3')" />
                <UButton color="gray" variant="ghost" size="xs" label="P" @click="format('formatBlock', 'p')" />
                <UButton color="gray" variant="ghost" size="xs" label="B" @click="format('bold')" />
                <UButton color="gray" variant="ghost" size="xs" label="I" @click="format('italic')" />
                <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-list-bullet" @click="format('insertUnorderedList')" />
                <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-numbered-list" @click="format('insertOrderedList')" />
              </div>
              <div
                ref="editorRef"
                contenteditable="true"
                class="min-h-[420px] px-4 py-3 text-sm outline-none prose prose-sm max-w-none dark:prose-invert"
                @input="syncEditor"
              />
            </div>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton :loading="isSaving" icon="i-heroicons-check" label="Save policies" @click="savePolicies" />
          </div>
        </template>
      </UCard>
    </div>
  </UDashboardPanelContent>
</template>
