<script setup lang="ts">
import QuoteEditor from '~/components/Quotes/Editor.vue'
definePageMeta({ auth: true })
useHead({ title: 'Edit quote · ERP' })
const route = useRoute()
</script>

<template><QuoteEditor :saved-quote-id="String(route.params.quoteId)" /></template>
