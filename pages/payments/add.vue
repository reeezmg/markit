<script setup lang="ts">
const router = useRouter()

const goBack = () => {
    router.push('/payments')
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <PaymentsRecordPaymentModal mode="page" @saved="goBack" @cancel="goBack" />
    </UDashboardPanelContent>
</template>
