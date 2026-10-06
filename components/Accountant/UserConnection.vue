<script setup lang="ts">
const emit=defineEmits(['saved']);
const props=defineProps<{companyId:string}>();
const auth=useNuxtApp().$auth;
const allowed=computed(()=>['admin','manager','accountant'].includes(auth.session.value?.role || ''));
const open=ref(false);const busy=ref(false);const data=ref<any>(null);const mappings=ref<Record<string,string>>({});
const toast=useToast();
const roles=computed<Record<string,[string,string]>>(()=>({salaryExpense:['Salary expense','EXPENSE'],salaryPayable:['Salary payable','OTHER_CURRENT_LIABILITY'],receivable:['Staff credit / receivable','ACCOUNTS_RECEIVABLE'],cash:['Cash','CASH'],bank:['Default payment bank','BANK'],opening:['Staff balance adjustments','OTHER_CURRENT_LIABILITY'],...Object.fromEntries((data.value?.banks||[]).map((b:any)=>[`bank:${b.id}`,[`Payments from ${b.name||'bank'}`,'BANK']]))}));
const request=(method:'GET'|'PUT'|'POST',suffix='',body?:any,owner=props.companyId)=>$fetch<any>(`/api/accountant/users${suffix}`,{method,headers:{'x-company-id':owner,'x-company-filter':owner},...(body?{body}:{})});
let loadVersion=0;
async function load(){const version=++loadVersion;busy.value=true;try{const result=await request('GET');if(version!==loadVersion)return;data.value=result;mappings.value={...result.mappings};}catch(e:any){if(version===loadVersion)toast.add({title:'Could not load staff accounting',description:e.data?.statusMessage||e.message,color:'red'});}finally{if(version===loadVersion)busy.value=false;}}
async function save(){const owner=props.companyId;const enable=!data.value.enabled;busy.value=true;try{await request('PUT','',{mappings:mappings.value},owner);if(enable)await request('POST','/enable',undefined,owner);if(owner===props.companyId)await load();emit('saved');toast.add({title:'Staff accounting connected',color:'green'});}catch(e:any){toast.add({title:'Accounting setup failed',description:e.data?.statusMessage||e.message,color:'red'});}finally{busy.value=false;}}

watch(open,value=>{if(value)load();});watch(()=>props.companyId,()=>{loadVersion++;data.value=null;if(open.value)load();});
</script>
<template>
 <UButton v-if="allowed" label="Accounting" icon="i-heroicons-book-open" size="xs" variant="soft" @click="open=true" />
 <USlideover v-model="open" :ui="{width:'max-w-2xl'}">
  <div class="p-5 space-y-5 overflow-y-auto">
   <div class="flex justify-between items-center"><h2 class="font-semibold text-lg">Staff accounting</h2><UButton icon="i-heroicons-x-mark" aria-label="Close" variant="ghost" @click="open=false" /></div>
   <p class="text-sm text-gray-500">Salary accruals, payouts and staff credit post here. Credit purchases reuse the bill accounting; salary credit deductions do not move cash.</p>
   <UProgress v-if="busy" />
   <template v-if="data">
    <UBadge :color="data.enabled?'green':'gray'">{{ data.enabled?'Automatic posting enabled':'Not connected' }}</UBadge>
    <div class="grid sm:grid-cols-2 gap-4">
     <UFormGroup v-for="([label,type],role) in roles" :key="role" :label="label" required>
      <USelect v-model="mappings[role]" :disabled="busy" :options="data.accounts.filter((a:any)=>a.accountType===type).map((a:any)=>({label:a.name,value:a.id}))" placeholder="Select account" />
     </UFormGroup>
    </div>
    <p class="text-xs text-gray-500">New activity only. Existing staff history remains in the user ledger without being imported. Posted entries retain their account choices. Staff credit defaults to the ERP receivable account.</p>
    <UButton :label="data.enabled?'Save account choices':'Connect new activity'" :loading="busy" @click="save" />
    <UButton label="View accounting" variant="outline" :to="`/accountant/manual-journals?entryCompany=${companyId}`" />
   </template>
  </div>
 </USlideover>
</template>
