<script setup lang="ts">
const route = useRoute();
await navigateTo(
    { path: '/investments/investors', query: route.query },
    { replace: true }
);
</script>
<template><div /></template>
