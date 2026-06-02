<script setup lang="ts">
const router = useRouter()

const goBack = () => {
    router.push('/sales-orders')
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <SalesOrdersNewSalesOrderModal mode="page" @saved="goBack" @cancel="goBack" />
    </UDashboardPanelContent>
</template>
