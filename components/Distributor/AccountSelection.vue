<script setup lang="ts">
const props=defineProps<{companyId:string;distributorId:string;sourceKey?:string;roles:string[]}>();
const model=defineModel<Record<string,string>>({default:()=>({})});
const data=ref<any>(null);
const error=ref('');
const types:Record<string,string[]>={payable:['ACCOUNTS_PAYABLE'],stock:['STOCK'],cash:['CASH'],bank:['BANK'],tax:['OTHER_CURRENT_ASSET']};
const names:Record<string,string>={payable:'Payable account',stock:'Stock account',cash:'Cash account',bank:'Bank account',tax:'Purchase tax account'};
const auth=useNuxtApp().$auth;
const allowed=computed(()=>['admin','manager','accountant'].includes(auth.session.value?.role || ''));
let generation=0;
watch(()=>[props.companyId,props.distributorId,props.sourceKey],async()=> {
  const current=++generation;data.value=null;error.value='';model.value={};
  if(!allowed.value||!props.distributorId) return;
  try {
    const [result, settings]=await Promise.all([
      $fetch<any>(`/api/accountant/distributors/${props.distributorId}`,{headers:{'x-company-id':props.companyId}}),
      $fetch<any>('/api/accountant/account-settings/defaults',{headers:{'x-company-id':props.companyId}}),
    ]);
    if(current!==generation)return;
    data.value=result;
    if(result.enabled) {
      const recorded=result.sources.find((s:any)=>s.source_key===props.sourceKey)?.accounts;
      model.value=recorded && Object.keys(recorded).length ? {...recorded} : {...result.mappings,...settings.defaults.purchase};
      // Historical named-bank source roles remain in snapshots, but new forms
      // select the native bank account directly instead of an archived bank ID.
      const event=result.events?.find((e:any)=>e.source_key===props.sourceKey);
      if(recorded && event?.bank_id && recorded[`bank:${event.bank_id}`]) model.value.bank=recorded[`bank:${event.bank_id}`];
    }
  } catch(e:any) {if(current===generation)error.value=e.data?.statusMessage || e.message;}
},{immediate:true});
const options=(role:string)=>(data.value?.accounts||[]).filter((a:any)=>(types[role] || ['BANK']).includes(a.accountType)).map((a:any)=>({label:a.name,value:a.id}));
</script>
<template>
  <div v-if="allowed" class="space-y-3 border-t dark:border-gray-700 pt-3">
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <template v-if="data?.enabled">
      <UFormGroup v-for="role in roles" :key="role" :label="names[role] || 'Bank account'" required>
        <USelect v-model="model[role]" :options="options(role)" placeholder="Select account" />
      </UFormGroup>
      <p class="text-xs text-gray-500">These accounts apply to this transaction. The distributor remains linked to every journal line.</p>
    </template>
    <p v-if="data && !data.enabled" class="text-sm text-gray-500">Connect this supplier under Settings → Account → Purchase.</p>
  </div>
</template>
