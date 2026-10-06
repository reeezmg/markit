<script setup lang="ts">
const api=useAccountantApi();
const toast=useToast();
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const options=ref<any>({accounts:[],people:[],currency:'INR'});
const defaults=ref<Record<string,Record<string,string>>>({});
function applyDefaults(){const saved=defaults.value[form.direction==='RECEIVE'?'receive':'pay']||{};form.moneyAccountId=moneyAccounts.value.some((a:any)=>a.value===saved.moneyAccountId)?saved.moneyAccountId:options.value.accounts.find((a:any)=>a.isPrimary&&a.accountType==='BANK')?.id||moneyAccounts.value[0]?.value||'';form.purposeAccountId=purposeAccounts.value.some((a:any)=>a.value===saved.purposeAccountId)?saved.purposeAccountId:'';}
const rows=ref<any[]>([]), total=ref(0), page=ref(1), search=ref('');
const loading=ref(false), saving=ref(false), loadError=ref('');
const form=reactive({direction:'RECEIVE',date:today(),moneyAccountId:'',purposeAccountId:'',amount:'',reference:'',note:'',person:''});
let requestId='';let submitted='';
const moneyAccounts=computed(()=>options.value.accounts.filter((a:any)=>['CASH','BANK'].includes(a.accountType)).map((a:any)=>({label:a.name,value:a.id})));
const purposeAccounts=computed(()=>options.value.accounts.filter((a:any)=>!['CASH','BANK'].includes(a.accountType)).map((a:any)=>({label:a.name,value:a.id})));
const people=computed(()=>[{label:'No person selected',value:''},...options.value.people.map((p:any)=>({label:`${p.name} (${({client:'Client',user:'Staff',distributor:'Distributor',contact:'Other contact'} as any)[p.kind]})`,value:`${p.kind}:${p.id}`}))]);
const columns=[{key:'date',label:'Date'},{key:'entryNumber',label:'Number'},{key:'direction',label:'Type'},{key:'details',label:'Accounts / person'},{key:'total',label:'Amount'},{key:'status',label:'Status'},{key:'actions',label:'Actions'}];
const amount=(n:any)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:options.value.currency}).format(Number(n));
async function loadRows(){loading.value=true;loadError.value='';try{const r=await api.get('/money',{query:{page:page.value,search:search.value}});rows.value=r.data;total.value=r.total;}catch(e:any){loadError.value=e.message;}finally{loading.value=false;}}
async function load(){try{const [o,s]=await Promise.all([api.get('/money/options'),api.get('/account-settings/defaults')]);options.value=o;defaults.value=s.defaults;applyDefaults();await loadRows();}catch(e:any){loadError.value=e.message;}}
watch(()=>form.direction,applyDefaults);
onMounted(load);
async function save(){
  if(saving.value)return;
  const [kind,id]=form.person.split(':');
  const data={direction:form.direction,date:form.date,moneyAccountId:form.moneyAccountId,purposeAccountId:form.purposeAccountId,amount:Number(form.amount),reference:form.reference,note:form.note,party:id?{kind,id}:null};
  if(!data.moneyAccountId || !data.purposeAccountId || !(data.amount>0)){toast.add({title:'Choose both accounts and enter a positive amount',color:'red'});return;}
  const fingerprint=JSON.stringify(data);
  if(fingerprint!==submitted || !requestId){requestId=crypto.randomUUID();submitted=fingerprint;}
  saving.value=true;
  try{const row=await api.post('/money',{...data,requestId});toast.add({title:`${row.entryNumber} recorded`,color:'green'});form.amount='';form.reference='';form.note='';requestId='';submitted='';page.value=1;await loadRows();}catch{}finally{saving.value=false;}
}
const reversing=ref<any>(null),reverseDate=ref(today()),reverseBusy=ref(false);
function askReverse(row:any){reversing.value=row;reverseDate.value=today();}
async function reverse(){if(!reversing.value || reverseBusy.value)return;reverseBusy.value=true;try{await api.post(`/money/${reversing.value.id}/reverse`,{date:reverseDate.value});reversing.value=null;await loadRows();toast.add({title:'Entry reversed',color:'green'});}catch{}finally{reverseBusy.value=false;}}
const isReceived=(row:any)=>row.lines?.some((l:any)=>['CASH','BANK'].includes(l.account.accountType)&&l.side==='DEBIT');
const personLabel=(row:any)=>row.lines?.[0]?.description || '';
function findSearch(){page.value=1;loadRows();}
watch(page,loadRows);
</script>
<template>
 <div class="space-y-5">
  <div><h2 class="text-lg font-semibold">Receive / Pay money</h2><p class="text-sm text-gray-500">Record money received or paid. The matching accounting entry is created automatically.</p></div>
  <UCard>
   <form class="space-y-4" @submit.prevent="save">
    <div class="flex gap-2"><UButton type="button" :disabled="saving" :variant="form.direction==='RECEIVE'?'solid':'outline'" color="green" @click="form.direction='RECEIVE'">Receive money</UButton><UButton type="button" :disabled="saving" :variant="form.direction==='PAY'?'solid':'outline'" @click="form.direction='PAY'">Pay money</UButton></div>
    <fieldset :disabled="saving" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
     <UFormGroup label="Date" required><UInput v-model="form.date" type="date" required /></UFormGroup>
     <UFormGroup :label="form.direction==='RECEIVE'?'Receive into':'Pay from'" required><USelect v-model="form.moneyAccountId" :options="moneyAccounts" placeholder="Cash or bank account" required /></UFormGroup>
     <UFormGroup :label="`Amount (${options.currency})`" required><UInput v-model="form.amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></UFormGroup>
     <UFormGroup label="Purpose account" required help="Examples: Sales, Expenses, Accounts Receivable or Accounts Payable."><USelect v-model="form.purposeAccountId" :options="purposeAccounts" placeholder="Select an account" required /></UFormGroup>
     <UFormGroup :label="form.direction==='RECEIVE'?'Received from':'Paid to'" help="Select a person when settling an outstanding amount."><USelectMenu v-model="form.person" :options="people" value-attribute="value" option-attribute="label" searchable placeholder="Optional person" /></UFormGroup>
     <UFormGroup label="Reference"><UInput v-model="form.reference" maxlength="100" placeholder="Receipt or payment reference" /></UFormGroup>
     <UFormGroup label="Note" class="sm:col-span-2 lg:col-span-3"><UInput v-model="form.note" maxlength="1000" placeholder="What is this payment for?" /></UFormGroup>
    </fieldset>
    <div class="flex flex-wrap gap-3 items-center justify-between"><p class="text-xs text-gray-500">This records a separate payment in the new accounts. For a bill or expense already paid, use its original page. For cash-to-bank movements, use Transfers.</p><UButton type="submit" :loading="saving" :disabled="loading || !options.accounts.length">{{ form.direction==='RECEIVE'?'Record receipt':'Record payment' }}</UButton></div>
   </form>
  </UCard>
  <UCard :ui="{body:{padding:'p-0 sm:p-0'}}">
   <form class="p-3 flex gap-2 border-b" @submit.prevent="findSearch"><UInput v-model="search" placeholder="Number, reference or note" icon="i-heroicons-magnifying-glass" /><UButton type="submit" variant="outline">Search</UButton><UButton variant="ghost" :loading="loading" @click="load">Refresh</UButton></form>
   <p v-if="loadError" class="p-3 text-red-500">{{ loadError }}</p>
   <UTable :rows="rows" :columns="columns" :loading="loading">
    <template #date-data="{row}">{{ row.journalDate.slice(0,10) }}</template>
    <template #direction-data="{row}"><UBadge :color="isReceived(row)?'green':'orange'" variant="subtle">{{ isReceived(row)?'Received':'Paid' }}</UBadge></template>
    <template #details-data="{row}"><div>{{ row.lines.map((l:any)=>l.account.name).join(' / ') }}</div><div class="text-xs text-gray-500">{{ personLabel(row) }}</div><div class="text-xs text-gray-500">{{ row.referenceNumber }} {{ row.notes }}</div></template>
    <template #total-data="{row}">{{ amount(row.total) }}</template>
    <template #status-data="{row}">{{ row.reversals.length?'Reversed':'Posted' }}</template>
    <template #actions-data="{row}"><UButton v-if="!row.reversals.length" size="xs" variant="ghost" @click="askReverse(row)">Reverse</UButton></template>
   </UTable>
   <div class="p-3 border-t flex justify-between items-center text-xs text-gray-500"><span>{{ total }} entries</span><UPagination v-model="page" :page-count="20" :total="total" /></div>
  </UCard>
  <UModal :model-value="!!reversing" @update:model-value="value=>{if(!value && !reverseBusy)reversing=null}"><UCard><template #header>Reverse {{ reversing?.entryNumber }}</template><p class="text-sm mb-4">This creates an opposite entry and keeps the original in the audit history.</p><UFormGroup label="Reversal date"><UInput v-model="reverseDate" type="date" /></UFormGroup><template #footer><div class="flex justify-end gap-2"><UButton variant="ghost" :disabled="reverseBusy" @click="reversing=null">Cancel</UButton><UButton color="red" :loading="reverseBusy" @click="reverse">Reverse entry</UButton></div></template></UCard></UModal>
 </div>
</template>
