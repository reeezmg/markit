<script setup lang="ts">
const route = useRoute();
await navigateTo({ path: `/loans/${encodeURIComponent(String(route.params.loanId))}`, query: route.query }, { replace: true });
</script>
<template><div /></template>
