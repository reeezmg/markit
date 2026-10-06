<script setup lang="ts">
definePageMeta({ auth: true });
const scope = useCompanyScope('form');
const route = useRoute();
if (typeof route.query.entryCompany === 'string') await scope.selectOwner(route.query.entryCompany);
const allowed = computed(() => ['admin', 'manager', 'accountant'].includes(scope.auth.session.value?.role || ''));
</script>
<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Account" />
      <div v-if="allowed" class="flex flex-col min-h-0 flex-1 overflow-auto">
        <div class="px-4 pt-4 sm:px-6"><CompanyFormField /></div>
        <main class="flex-1 min-w-0 p-4 sm:p-6 overflow-auto">
          <NuxtPage :key="`${scope.companyId.value}:${route.fullPath}`" />
        </main>
      </div>
      <p v-else class="p-6">Accountant access requires an admin, manager or accountant role.</p>
    </UDashboardPanel>
  </UDashboardPage>
</template>
