<script setup lang="ts">
import { accountantSections } from '~/utils/accountant-navigation';
import ManagementPage from '~/components/Accountant/AccountantManagementPage.vue';
const route = useRoute();
const view = computed(() => String(route.params.view));
if (view.value === 'investors') await navigateTo({path:'/investments/investors',query:route.query}, {replace:true});
else if (!accountantSections.some(section => section.links.some(([path]) => path === view.value))) {
  throw createError({ statusCode: 404, statusMessage: 'Accountant page not found' });
}
</script>
<template>
  <AccountantChartOfAccountsPage v-if="view === 'chart-of-accounts'" />
  <AccountantManualJournalsPage v-else-if="view === 'manual-journals'" />
  <AccountantMoneyPage v-else-if="view === 'money'" />
  <AccountantEcommercePage v-else-if="view === 'ecommerce'" />
  <AccountantAccountTransfersPage v-else-if="view === 'account-transfers'" />
  <AccountantDirectory v-else-if="['contacts', 'projects'].includes(view)" :kind="view" />
  <ManagementPage v-else />
</template>
