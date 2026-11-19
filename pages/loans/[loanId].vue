<script setup lang="ts">
const route = useRoute();
</script>
<template><InvestmentsLoanAccountPage :loan-id="String(route.params.loanId)" /></template>
