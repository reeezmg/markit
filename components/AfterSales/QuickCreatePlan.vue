<script setup lang="ts">
import { defaultServiceRules, type ServiceKind } from '~/utils/after-sales'
import { billingErrorMessage } from '~/utils/billing-error'
import RulesEditor from './RulesEditor.vue'
const props=defineProps<{name:string}>()
const emit=defineEmits<{created:[plan:any];close:[]}>()
const scope=useCompanyScope(),name=ref(props.name),kind=ref<ServiceKind>('WARRANTY'),rules=ref(defaultServiceRules()),busy=ref(false),error=ref('')
const companyId=scope.companyId.value
watch(()=>scope.companyId.value,()=>emit('close'))
async function save(){
  if(busy.value||companyId!==scope.companyId.value)return
  busy.value=true;error.value=''
  try{const input={name:name.value.trim(),kind:kind.value,rules:rules.value};const plan:any=await scope.fetch('/api/after-sales/configurations',{method:'POST',body:input});if(companyId===scope.companyId.value)emit('created',{...input,...plan,archived:false})}catch(e){error.value=billingErrorMessage(e)}finally{busy.value=false}
}
</script>
<template>
  <UModal :model-value="true" prevent-close :ui="{width:'sm:max-w-3xl'}">
    <UCard><template #header><h2 class="font-semibold">Create coverage plan</h2></template>
      <form id="quick-create-plan" class="max-h-[65vh] space-y-4 overflow-y-auto" @submit.prevent="save">
        <CompanyFormField locked/>
        <UAlert v-if="error" color="red" :title="error" role="alert"/>
        <fieldset :disabled="busy" class="space-y-4">
          <UFormGroup label="Plan name" required><UInput v-model="name" required maxlength="200" autofocus/></UFormGroup>
          <UFormGroup label="Plan type"><USelect v-model="kind" :options="[{value:'WARRANTY',label:'Warranty'},{value:'GUARANTEE',label:'Guarantee'},{value:'MAINTENANCE',label:'Maintenance'}]"/></UFormGroup>
          <RulesEditor v-model="rules" :kind="kind"/>
        </fieldset>
      </form>
      <template #footer><div class="flex justify-end gap-2"><UButton color="white" :disabled="busy" @click="emit('close')">Cancel</UButton><UButton type="submit" form="quick-create-plan" :loading="busy" :disabled="busy||!name.trim()">Save and select plan</UButton></div></template>
    </UCard>
  </UModal>
</template>
