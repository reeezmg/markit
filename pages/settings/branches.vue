<script setup lang="ts">
definePageMeta({ auth: true });

type Branch = { id: string; name: string; status: boolean; phone: string | null; address: { city: string | null; state: string | null } | null };
type BranchesResponse = { id: string; name: string; isHeadOffice: boolean; parentCompanyId: string | null; branches: Branch[] };

const auth = useNuxtApp().$auth;
const toast = useToast();
const { data, refresh, pending } = await useFetch<BranchesResponse>('/api/branches');
if (data.value?.parentCompanyId) await navigateTo('/settings/store', { replace: true });
const saving = ref(false);
const form = reactive({ name: '', phone: '', city: '', state: '' });
const isAdmin = computed(() => auth.session.value?.role === 'admin');

async function makeHeadOffice() {
  saving.value = true;
  try {
    await $fetch('/api/branches/head-office', { method: 'POST' });
    await refresh();
    toast.add({ title: 'Head office enabled' });
  } catch (error: any) {
    toast.add({ title: 'Could not enable head office', description: error?.data?.statusMessage, color: 'red' });
  } finally { saving.value = false; }
}

async function addBranch() {
  saving.value = true;
  try {
    await $fetch('/api/branches', { method: 'POST', body: form });
    Object.assign(form, { name: '', phone: '', city: '', state: '' });
    await refresh();
    toast.add({ title: 'Branch added' });
  } catch (error: any) {
    toast.add({ title: 'Could not add branch', description: error?.data?.statusMessage, color: 'red' });
  } finally { saving.value = false; }
}
</script>

<template>
  <div v-if="!data?.parentCompanyId" class="p-4 sm:p-6 space-y-6 max-w-4xl">
    <div>
      <h2 class="text-xl font-semibold">Company & Branches</h2>
      <p class="text-sm text-gray-500 mt-1">Each branch has its own bills, stock, settings and accounts. People with access can switch companies from the dashboard menu.</p>
    </div>
    <div v-if="pending" class="text-sm text-gray-500">Loading company...</div>
    <template v-else-if="data">
      <UCard v-if="!data.isHeadOffice">
        <h3 class="font-semibold mb-2">Make {{ data.name }} a head office</h3>
        <p class="text-sm text-gray-500 mb-4">This lets you create linked branches. Existing company data stays here.</p>
        <UButton v-if="isAdmin" :loading="saving" @click="makeHeadOffice">Make head office</UButton>
      </UCard>
      <template v-else>
        <UCard>
          <h3 class="font-semibold mb-3">Branches of {{ data.name }}</h3>
          <p v-if="!data.branches.length" class="text-sm text-gray-500">No branches yet.</p>
          <ul v-else class="divide-y divide-gray-200 dark:divide-gray-800">
            <li v-for="branch in data.branches" :key="branch.id" class="py-3 flex items-center justify-between gap-4">
              <div>
                <div class="font-medium">{{ branch.name }}</div>
                <div class="text-sm text-gray-500">{{ [branch.address?.city, branch.address?.state].filter(Boolean).join(', ') || branch.phone || 'No location added' }}</div>
              </div>
              <UBadge :color="branch.status ? 'green' : 'gray'">{{ branch.status ? 'Active' : 'Inactive' }}</UBadge>
            </li>
          </ul>
        </UCard>
        <UCard v-if="isAdmin">
          <h3 class="font-semibold mb-3">Add branch</h3>
          <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="addBranch">
            <UFormGroup label="Branch name" required><UInput v-model="form.name" required maxlength="120" /></UFormGroup>
            <UFormGroup label="Phone"><UInput v-model="form.phone" maxlength="30" /></UFormGroup>
            <UFormGroup label="City"><UInput v-model="form.city" maxlength="120" /></UFormGroup>
            <UFormGroup label="State"><UInput v-model="form.state" maxlength="120" /></UFormGroup>
            <div class="sm:col-span-2"><UButton type="submit" :loading="saving">Create branch</UButton></div>
          </form>
        </UCard>
      </template>
    </template>
  </div>
</template>
