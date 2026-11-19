<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Workspace from './Workspace.vue'
const props=defineProps<{clientId:string;companyId:string}>()
const scope=useCompanyScope('form'),ready=ref(false),error=ref('')
onMounted(async()=>{try{await scope.ready;await scope.selectCompany(props.companyId);ready.value=true}catch(e:any){error.value=e?.data?.statusMessage||e.message||'Could not open this company client.'}})
</script>
<template><p v-if="error" role="alert" class="p-6 text-red-600">{{error}}</p><Workspace v-else-if="ready" section="clients" :record-id="clientId" embedded/><p v-else role="status" class="p-6">Loading client CRM…</p></template>
