<script setup lang="ts">
const scope = useCompanyScope('form', true)
await scope.ready
const route = useRoute()
</script>
<template><AfterSalesCustomerHistory :client-id="String(route.params.clientId || '')"/></template>
