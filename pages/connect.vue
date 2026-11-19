<script setup lang="ts">
import { canManageConnect } from '~/utils/connect-access'
definePageMeta({ auth: true })
const scope = useCompanyScope('form'), route = useRoute()
if (typeof route.query.entryCompany === 'string') await scope.selectOwner(route.query.entryCompany)
const allowed = computed(() => canManageConnect(scope.auth.session.value?.role))
</script>
<template>
  <UDashboardPage><UDashboardPanel grow>
    <ErpPageNavbar title="Connect" />
    <template v-if="allowed">
      <CompanyFormField toolbar />
      <main class="flex-1 overflow-auto p-4 sm:p-6"><NuxtPage :key="scope.companyId.value" /></main>
    </template>
    <p v-else class="p-6">A company administrator or manager can manage business connections. Your current role is {{ scope.auth.session.value?.role || 'unavailable' }}.</p>
  </UDashboardPanel></UDashboardPage>
</template>
