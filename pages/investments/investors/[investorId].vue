<script setup lang="ts">
const route = useRoute();
</script>
<template
    ><InvestmentsInvestorAccountPage
        :investor-id="String(route.params.investorId)"
/></template>
