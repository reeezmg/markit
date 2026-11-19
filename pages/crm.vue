<script setup lang="ts">
import { crmStaff } from '../utils/crm'
definePageMeta({auth:true})
const scope=useCompanyScope('form'),route=useRoute()
await scope.ready
if(typeof route.query.entryCompany==='string'&&route.query.entryCompany!==scope.companyId.value)await scope.selectCompany(route.query.entryCompany)
const allowed=computed(()=>crmStaff(scope.auth.session.value?.role||''))
</script>
<template><UDashboardPage><UDashboardPanel grow><ErpPageNavbar title="CRM"/><NuxtPage v-if="allowed" :page-key="route=>route.path+scope.companyId.value"/><UDashboardPanelContent v-else><UAlert title="CRM requires a staff account" color="red"/></UDashboardPanelContent></UDashboardPanel></UDashboardPage></template>
