<script setup lang="ts">
const props=defineProps<{companyId:string}>();
const auth=useNuxtApp().$auth;
const allowed=computed(()=>['admin','manager','accountant'].includes(auth.session.value?.role || ''));
const open=ref(false);const busy=ref(false);const data=ref<any>(null);const mappings=ref<Record<string,string>>({});
const toast=useToast();
const roles:Record<string,[string,string]>={cash:['Cash','CASH'],bank:['Payment bank account','BANK'],receivable:['Customer credit / receivable','ACCOUNTS_RECEIVABLE'],sales:['Sales income','INCOME'],outputTax:['Sales tax payable','OTHER_CURRENT_LIABILITY'],stock:['Stock / inventory','STOCK'],cogs:['Cost of goods sold','COST_OF_GOODS_SOLD'],expense:['Expense account','EXPENSE'],inputTax:['Recoverable expense tax','OTHER_CURRENT_ASSET'],expensePayable:['Unpaid expenses','OTHER_CURRENT_LIABILITY']};
const request=(method:'GET'|'PUT'|'POST',suffix='',body?:any)=>$fetch<any>(`/api/accountant/erp${suffix}`,{method,headers:{'x-company-id':props.companyId,'x-company-filter':props.companyId},...(body?{body}:{})});
async function load(){busy.value=true;try{data.value=await request('GET');mappings.value={...data.value.mappings};}catch(e:any){toast.add({title:'Could not load ERP accounting',description:e.data?.statusMessage || e.message,color:'red'});}finally{busy.value=false;}}
async function save(){busy.value=true;try{await request('PUT','',{mappings:mappings.value});if(!data.value.enabled)await request('POST','/enable');await load();toast.add({title:'ERP accounting connected',color:'green'});}catch(e:any){toast.add({title:'Accounting setup failed',description:e.data?.statusMessage || e.message,color:'red'});}finally{busy.value=false;}}
watch(open,value=>{if(value)load();});watch(()=>props.companyId,()=>{data.value=null;if(open.value)load();});
</script>
<template>
 <UButton v-if="allowed" label="Accounting" icon="i-heroicons-book-open" size="xs" variant="soft" @click="open=true" />
 <USlideover v-model="open" :ui="{width:'max-w-2xl'}">
  <div class="p-5 space-y-5 overflow-y-auto">
   <div class="flex justify-between items-center"><h2 class="font-semibold text-lg">ERP accounting</h2><UButton icon="i-heroicons-x-mark" aria-label="Close" variant="ghost" @click="open=false" /></div>
   <p class="text-sm text-gray-500">Billing and Sales share the same entries. Purchases paid through distributor expenses are accounted for only once.</p>
   <UProgress v-if="busy" />
   <template v-if="data">
    <UBadge :color="data.enabled?'green':'gray'">{{ data.enabled?'Automatic posting enabled':'Not connected' }}</UBadge>
    <div class="grid sm:grid-cols-2 gap-4">
     <UFormGroup v-for="([label,type],role) in roles" :key="role" :label="label" required>
      <USelect v-model="mappings[role]" :disabled="busy" :options="data.accounts.filter((a:any)=>a.accountType===type).map((a:any)=>({label:a.name,value:a.id}))" placeholder="Select account" />
     </UFormGroup>
    </div>
    <p class="text-xs text-gray-500">Defaults apply to new documents. Existing posted documents retain their account choices. Enabling posting starts with new activity; older documents are not imported.</p>
    <UButton :label="data.enabled?'Save account choices':'Connect new activity'" :loading="busy" @click="save" />
    <UButton label="View accounting" variant="outline" :to="`/accountant/manual-journals?entryCompany=${companyId}`" />
   </template>
  </div>
 </USlideover>
</template>
