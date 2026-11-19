<script setup lang="ts">
definePageMeta({auth:true})
useHead({title:'Payments received · ERP'})
const scope=useCompanyScope('table')
await scope.ready
</script>
<template><UDashboardPanelContent><BillingInvoiceWorkspace payments /></UDashboardPanelContent></template>
