<script setup lang="ts">
import Editor from '~/components/Quotes/Editor.vue'
definePageMeta({ auth: true })
useHead({ title: 'Edit sales order · ERP' })
const route = useRoute()
</script>
<template><Editor document-kind="sales-order" :saved-quote-id="String(route.params.orderId)" /></template>
