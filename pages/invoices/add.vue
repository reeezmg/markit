<script setup lang="ts">
const router = useRouter()

const goBack = () => {
    router.push('/invoices')
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <InvoicesNewInvoiceModal mode="page" @saved="goBack" @cancel="goBack" />
    </UDashboardPanelContent>
</template>
