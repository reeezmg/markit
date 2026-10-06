<script setup lang="ts">
import { resolveComponent } from 'vue';
const props = defineProps<{ companyId: string; distributorId: string; embedded?: boolean }>();
const emit = defineEmits<{ updated: [] }>();
const toast = useToast();
const open = ref(false);
const busy = ref(false);
const data = ref<any>(null);
const mappings = ref<Record<string,string>>({});
const page = ref(1);
const auth = useNuxtApp().$auth;
const allowed = computed(()=>['admin','manager','accountant'].includes(auth.session.value?.role || ''));
const types: Record<string,string[]> = {payable:['ACCOUNTS_PAYABLE'],stock:['STOCK'],cash:['CASH'],bank:['BANK'],tax:['OTHER_CURRENT_ASSET'],opening:['EQUITY','OTHER_CURRENT_LIABILITY']};
const labels: Record<string,string> = {payable:'Accounts payable',stock:'Stock / inventory',cash:'Cash',bank:'Payment bank account',tax:'Recoverable purchase tax',opening:'Opening balance offset'};
const roles = computed(()=>Object.keys(types));
const label = (role:string)=>labels[role] || `Bank: ${data.value?.banks.find((b:any)=>role===`bank:${b.id}`)?.name || role}`;
const options = (role:string)=>(data.value?.accounts || []).filter((a:any)=>(types[role] || ['BANK']).includes(a.accountType)).map((a:any)=>({label:`${a.code ? a.code+' · ' : ''}${a.name}`,value:a.id}));
const money = (value:any)=>Number(value || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const rows = computed(()=>(data.value?.ledger || []).slice((page.value-1)*25,page.value*25));
const columns = [{key:'date',label:'Date'},{key:'reference_number',label:'Reference'},{key:'account',label:'Account'},{key:'debit',label:'Debit'},{key:'credit',label:'Credit'},{key:'journal',label:'Journal'}];
async function request(method:'GET'|'PUT'|'POST',suffix='',body?:any) {
  return await $fetch<any>(`/api/accountant/distributors/${props.distributorId}${suffix}`,{
    method,headers:{'x-company-id':props.companyId,'x-company-filter':props.companyId},...(body ? {body} : {}),
  });
}
async function load() {
  busy.value=true;
  try {
    data.value=await request('GET'); mappings.value={...data.value.mappings}; page.value=1;
    for(const role of roles.value) if(!mappings.value[role] && options(role).length===1) mappings.value[role]=options(role)[0].value;
  } catch(e:any) { toast.add({title:'Could not load distributor accounts',description:e.data?.statusMessage || e.message,color:'red'}); }
  finally { busy.value=false; }
}
async function save(importHistory=false) {
  busy.value=true;
  try {
    await request('PUT','',{mappings:Object.fromEntries(Object.entries(mappings.value).filter(([,v])=>v))});
    if(importHistory) await request('POST','/import');
    toast.add({title:importHistory?'History imported and automatic posting enabled':'Account choices saved for new transactions',color:'green'});
    await load();
    emit('updated');
  } catch(e:any) { toast.add({title:'Accounting update failed',description:e.data?.statusMessage || e.message,color:'red'}); }
  finally { busy.value=false; }
}
watch(open,value=>{if(value)load();});
onMounted(()=>{if(props.embedded)load();});
watch(()=>[props.companyId,props.distributorId],()=>{data.value=null;if(open.value)load();});
</script>

<template>
  <UButton v-if="allowed && !embedded" label="Accounting" icon="i-heroicons-book-open" variant="soft" size="sm" @click="open=true" />
  <component :is="embedded ? 'div' : resolveComponent('USlideover')" v-model="open" :ui="{width:'max-w-4xl'}">
    <div class="h-full overflow-y-auto p-5 space-y-5">
      <div class="flex justify-between items-center gap-3">
        <h2 class="font-semibold text-lg">Distributor accounting · {{ data?.distributor.name }}</h2>
        <UButton v-if="!embedded" icon="i-heroicons-x-mark" variant="ghost" @click="open=false" />
      </div>
      <p class="text-sm text-gray-500">Choose the accounts used for purchases, returns and money transactions. Each entry keeps this distributor attached, even when accounts are shared.</p>
      <UProgress v-if="busy" />
      <template v-if="data">
        <UBadge :color="data.enabled ? 'green' : 'amber'">{{ data.enabled ? 'Automatic posting enabled' : 'Not connected yet' }}</UBadge>
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormGroup v-for="role in roles" :key="role" :label="label(role)" :required="data.requiredRoles.includes(role)">
            <USelect v-model="mappings[role]" :options="options(role)" placeholder="Select an account" :disabled="busy" />
            <p v-if="!options(role).length" class="text-xs text-amber-600 mt-1">Create an account of this type in the chart of accounts.</p>
            <p v-if="role === 'bank'" class="text-xs text-gray-500 mt-1">Default for bank payments. You can choose another bank when recording a payment.</p>
          </UFormGroup>
        </div>
        <div class="flex gap-3 flex-wrap">
          <UButton label="Save account choices" :loading="busy" @click="save(false)" />
          <UButton label="Chart of accounts" :to="`/accountant/chart-of-accounts?entryCompany=${companyId}`" variant="outline" target="_blank" />
        </div>
        <p class="text-xs text-gray-500">Changes apply to new transactions. Existing entries keep their original accounts. Tax is split only where the source document records a tax amount.</p>
        <div class="grid grid-cols-3 gap-3 text-sm">
          <div class="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">Legacy due<strong class="block">{{ money(data.legacyBalance) }}</strong></div>
          <div class="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">Expected payable<strong class="block">{{ money(data.expectedBalance) }}</strong></div>
          <div class="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">Posted payable<strong class="block">{{ money(data.postedBalance) }}</strong></div>
        </div>
        <UAlert v-for="error in data.errors" :key="error" color="red" :title="error" />
        <div class="rounded-lg border dark:border-gray-700 p-4 space-y-3">
          <h3 class="font-medium">Import existing history</h3>
          <p class="text-sm text-gray-500">{{ data.events.length }} source entries · {{ data.unpostedCount }} not yet imported. Import includes opening dues, purchases, credits, payments and returns. Stock quantities stay unchanged. Repeating the import does not duplicate journals.</p>
          <UButton :label="data.enabled ? 'Reconcile history' : 'Import history and enable posting'" :loading="busy" :disabled="data.errors.length > 0" @click="save(true)" />
          <p class="text-sm text-gray-500">Reconcile history imports missing entries and reverses/reposts changed entries, then checks posted payable against expected payable.</p>
        </div>
        <h3 class="font-medium">Accounting entries</h3>
        <UTable :rows="rows" :columns="columns">
          <template #date-data="{row}">{{ new Date(row.journal_date).toLocaleDateString() }}</template>
          <template #debit-data="{row}">{{ row.side==='DEBIT' ? money(row.amount) : '—' }}</template>
          <template #credit-data="{row}">{{ row.side==='CREDIT' ? money(row.amount) : '—' }}</template>
          <template #journal-data="{row}"><NuxtLink class="text-primary-500" :to="`/accountant/manual-journals?entryCompany=${companyId}&journal=${row.id}`">View</NuxtLink></template>
        </UTable>
        <UPagination v-model="page" :page-count="25" :total="data.ledger.length" />
      </template>
    </div>
  </component>
</template>
