<script setup lang="ts">
import { useCreateCollection } from '~/lib/company-hooks/collection'
const props=defineProps<{modelValue:boolean;presetName:string}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];created:[collection:any]}>()
const scope=useCompanyScope(),create=useCreateCollection(),name=ref(''),description=ref(''),busy=ref(false),error=ref('')
const isOpen=computed({get:()=>props.modelValue,set:(value:boolean)=>emit('update:modelValue',value)})
watch(()=>props.modelValue,open=>{if(open){name.value=props.presetName;description.value='';error.value=''}})
watch(()=>scope.companyId.value,()=>emit('update:modelValue',false))
async function save(){
  if(busy.value||!name.value.trim())return
  const companyId=scope.companyId.value;busy.value=true;error.value=''
  try{
    const collection=await create.mutateAsync({data:{name:name.value.trim(),description:description.value.trim(),status:true,targetAudience:'all',company:{connect:{id:companyId}}}})
    if(companyId===scope.companyId.value&&collection){emit('created',collection);emit('update:modelValue',false)}
  }catch(e:any){error.value=e?.info?.message||e?.message||'Could not create collection.'}finally{busy.value=false}
}
</script>
<template>
  <UDashboardModal v-model="isOpen" title="Add Collection" prevent-close>
    <CompanyFormField locked/>
    <form id="quick-create-collection" class="space-y-4" @submit.prevent="save">
      <UAlert v-if="error" color="red" :title="error" role="alert"/>
      <UFormGroup label="Collection name" required><UInput v-model="name" required autofocus :disabled="busy"/></UFormGroup>
      <UFormGroup label="Description"><UTextarea v-model="description" :disabled="busy"/></UFormGroup>
    </form>
    <template #footer><UButton type="submit" form="quick-create-collection" :loading="busy" :disabled="busy||!name.trim()">Save</UButton><UButton color="white" :disabled="busy" @click="isOpen=false">Cancel</UButton></template>
  </UDashboardModal>
</template>
