<script setup lang="ts">
const router = useRouter()

const goBack = () => {
    router.push('/quotes')
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <QuotesNewQuoteModal mode="page" @saved="goBack" @cancel="goBack" />
    </UDashboardPanelContent>
</template>
