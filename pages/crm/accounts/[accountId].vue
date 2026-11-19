<script setup lang="ts">
import CRMWorkspace from '../../../components/CRM/Workspace.vue'
const route=useRoute();
</script>
<template><CRMWorkspace section="accounts" :record-id="String(route.params.accountId)"/></template>
