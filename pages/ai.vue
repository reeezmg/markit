<script setup lang="ts">
definePageMeta({
    auth: true,
});
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="AI" />
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
