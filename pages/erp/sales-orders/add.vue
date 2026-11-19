<script setup lang="ts">
import Editor from '~/components/Quotes/Editor.vue'
definePageMeta({ auth: true })
useHead({ title: 'Add sales order · ERP' })
</script>
<template><Editor document-kind="sales-order" /></template>
