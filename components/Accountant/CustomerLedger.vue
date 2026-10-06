<script setup lang="ts">
const props=defineProps<{companyId:string;accountId:string}>();
const auth=useNuxtApp().$auth;
const allowed=computed(()=>['admin','manager','accountant'].includes(auth.session.value?.role || ''));
const open=ref(false),busy=ref(false),data=ref<any>(null),error=ref('');
let version=0;
async function load(){const v=++version;busy.value=true;error.value='';data.value=null;try{const result=await $fetch(`/api/accountant/erp/customers/${props.accountId}`,{headers:{'x-company-id':props.companyId,'x-company-filter':props.companyId}});if(v===version)data.value=result;}catch(e:any){if(v===version)error.value=e.data?.statusMessage||e.message;}finally{if(v===version)busy.value=false;}}
watch(open,value=>{if(value)load()});
watch(()=>[props.companyId,props.accountId],()=>{++version;data.value=null;if(open.value)load()});
const columns=[{key:'journal_date',label:'Date'},{key:'reference_number',label:'Reference'},{key:'account_name',label:'Account'},{key:'side',label:'Debit / Credit'},{key:'amount',label:'Amount'},{key:'journal',label:'Journal'}];
</script>
<template>
 <div v-if="allowed" class="p-3"><UButton size="xs" variant="soft" icon="i-heroicons-book-open" @click="open=true">Customer accounting ledger</UButton></div>
 <USlideover v-model="open" :ui="{width:'max-w-3xl'}"><div class="p-5 space-y-4 overflow-auto">
  <div class="flex justify-between"><h2 class="font-semibold">{{ data?.customer.name || 'Customer' }} accounting</h2><UButton icon="i-heroicons-x-mark" variant="ghost" aria-label="Close" @click="open=false" /></div>
  <UProgress v-if="busy" /><p v-if="error" class="text-red-500">{{ error }}</p>
  <template v-if="data"><p>Posted receivable: {{ Number(data.due).toFixed(2) }}</p><p class="text-xs text-gray-500">Posted accounting entries only. Reversals remain visible. Bills excluded from accounting are not included.</p>
  <UTable :rows="data.rows" :columns="columns"><template #journal_date-data="{row}">{{ String(row.journal_date).slice(0,10) }}</template><template #journal-data="{row}"><NuxtLink class="text-primary" :to="`/accountant/manual-journals?entryCompany=${companyId}&journal=${row.id}`">{{ row.entry_number }}</NuxtLink></template></UTable></template>
 </div></USlideover>
</template>
