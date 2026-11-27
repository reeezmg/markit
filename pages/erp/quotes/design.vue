<script setup lang="ts">
import DesignerPage from '~/components/DocumentDesigner/Page.vue'
definePageMeta({ auth: true, layout: false, documentDesigner: true })
useHead({ title: 'Quote print designer' })
</script>
<template><DesignerPage document-kind="quote" /></template>
