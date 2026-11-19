<script setup lang="ts">
import QuoteEditor from '~/components/Quotes/Editor.vue'
definePageMeta({ auth: true })
useHead({ title: 'Add quote · ERP' })
</script>

<template><QuoteEditor /></template>
