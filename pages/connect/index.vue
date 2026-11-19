<script setup lang="ts">
definePageMeta({ auth: true })
const route = useRoute()
await navigateTo({ path: '/connect/whatsapp', query: route.query }, { replace: true })
</script>
<template><span /></template>
