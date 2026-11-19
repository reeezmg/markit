<script setup lang="ts">
import { salesInvoiceRedirect } from '~/utils/sales-view'
definePageMeta({auth:true})
await navigateTo(salesInvoiceRedirect(useRoute().query), { replace: true })
</script>
<template><div /></template>
