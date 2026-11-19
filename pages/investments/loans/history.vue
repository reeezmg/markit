<script setup lang="ts">
const route = useRoute();
await navigateTo({ path: '/loans/history', query: route.query }, { replace: true });
</script>
<template><div /></template>
