<script setup lang="ts">
import CRMWorkspace from '../../../components/CRM/Workspace.vue'
const route=useRoute();
</script>
<template><CRMWorkspace section="deals" :record-id="String(route.params.dealId)"/></template>
