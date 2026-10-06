<script setup lang="ts">
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

type CompanyOption = { id: string; name: string; logo: string | null; parentCompanyId: string | null; isHeadOffice: boolean };
const auth = useNuxtApp().$auth;
const toast = useToast();
const switching = ref(false);
const { data: companies } = await useFetch<CompanyOption[]>('/api/auth/accessible-companies');
const activeCompany = computed(() => companies.value?.find((company) => company.id === auth.session.value?.companyId));

async function changeView(companyId?: string) {
  if (switching.value || !companyId || companyId === auth.session.value?.companyId) return;
  switching.value = true;
  try {
    await $fetch('/api/auth/switch-company', { method: 'POST', body: { companyId }, credentials: 'include' });
    await auth.updateSession();
    if (auth.session.value?.companyId !== companyId) {
      throw new Error('The selected store was not saved in your session');
    }
    if (Capacitor.isNativePlatform()) await SplashScreen.show({ autoHide: false });
    window.location.reload();
  } catch (error: any) {
    toast.add({ title: 'Could not change store view', description: error?.data?.statusMessage ?? error?.message ?? 'Please try again', color: 'red' });
    switching.value = false;
  }
}

const options = computed(() => [
  (companies.value ?? []).map((company) => ({
    label: company.name,
    icon: company.id === auth.session.value?.companyId
      ? 'i-heroicons-check'
      : company.isHeadOffice ? 'i-heroicons-building-office-2' : 'i-heroicons-building-storefront',
    click: () => changeView(company.id),
  })),
]);
</script>

<template>
  <UDropdown v-slot="{ open }" mode="click" :items="options" class="w-full" :ui="{ width: 'w-full' }">
    <UButton color="gray" variant="ghost" class="w-full min-w-0" :loading="switching" :class="[open && 'bg-gray-50 dark:bg-gray-800']" :title="activeCompany?.name">
      <UAvatar
        :src="activeCompany?.logo ? `https://images.markit.co.in/${activeCompany.logo}` : undefined"
        :alt="activeCompany?.name" size="sm"
      />
      <span class="truncate text-gray-900 dark:text-white font-semibold">
        {{ activeCompany?.name ?? auth.session.value?.companyName }}
      </span>
    </UButton>
  </UDropdown>
</template>
