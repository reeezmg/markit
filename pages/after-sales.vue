<script setup lang="ts">
definePageMeta({ auth: true });
const scope = useCompanyScope('form', true);
await scope.ready;
const afterSales = useAfterSalesFeature(scope.companyId, scope.fetch);
await afterSales.ready;
</script>
<template><UDashboardPage><UDashboardPanel grow><ErpPageNavbar title="After-sales"/><NuxtPage v-if="afterSales.enabled.value" :page-key="route => route.path + String(route.query.entryCompany || '')"/><UDashboardPanelContent v-else><UAlert title="After-sales is turned off for this company" description="Enable after-sales in Company & Branches settings to use this workspace." color="gray" /></UDashboardPanelContent></UDashboardPanel></UDashboardPage></template>
