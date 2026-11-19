<script setup lang="ts">
import { ref, onMounted } from 'vue'
import RecordEditor from './RecordEditor.vue'
const props=defineProps<{companyId:string;clientId?:string;clientName?:string}>()
const emit=defineEmits<{close:[];saved:[]}>()
const scope=useCompanyScope('form'),boot=ref<any>(null),error=ref('')
onMounted(async()=>{
  try{
    await scope.ready;await scope.selectCompany(props.companyId)
    const result=await scope.fetch('/api/crm/bootstrap',{retry:0})
    if(!result.ready)throw Error('CRM setup is pending.')
    boot.value=result
  }catch(e:any){error.value=e?.data?.statusMessage||e.message||'Could not open the task form.'}
})
</script>
<template>
  <RecordEditor v-if="boot" kind="activities" :record="{kind:'TASK',clientId:clientId||'',clientName}" :settings="boot.settings" :staff="boot.staff" :company-id="companyId" :actor="boot.actor" @close="emit('close')" @saved="emit('saved');emit('close')"/>
  <UModal v-else :model-value="true" @update:model-value="value=>{if(!value)emit('close')}"><UCard><p :role="error?'alert':'status'">{{error||'Loading task form…'}}</p><UButton class="mt-4" color="gray" @click="emit('close')">Close</UButton></UCard></UModal>
</template>
