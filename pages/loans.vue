<script setup lang="ts">
definePageMeta({ auth: true });
const scope = useCompanyScope('form'), route = useRoute();
if (typeof route.query.entryCompany === 'string') await scope.selectOwner(route.query.entryCompany);
const allowed = computed(() => ['admin', 'manager', 'accountant'].includes(scope.auth.session.value?.role || ''));
const title = computed(() => route.path === '/loans/history' ? 'Loans - Earlier history' : route.path === '/loans/repayments' ? 'Loans - Repayments' : route.path === '/loans/settings' ? 'Loans - Settings' : route.params.loanId ? 'Loans - Loan details' : 'Loans - Loan accounts');
</script>
<template><UDashboardPage><UDashboardPanel grow>
    <ErpPageNavbar :title="title" />
    <template v-if="allowed"><CompanyFormField toolbar /><main class="flex-1 overflow-auto p-4 sm:p-6"><NuxtPage :key="`${scope.companyId.value}:${route.fullPath}`" /></main></template>
    <p v-else class="p-6">Loans requires an admin, manager or accountant role.</p>
</UDashboardPanel></UDashboardPage></template>
