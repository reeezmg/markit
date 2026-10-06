<script setup lang="ts">
import {startOfDay,endOfDay,format} from 'date-fns';
const scope=useCompanyScope('table'),toast=useToast();
const selectedDate=ref({start:new Date(),end:new Date()}),report=ref<any>(null),loading=ref(false),error=ref('');
let version=0;
async function load(){const v=++version;loading.value=true;error.value='';report.value=null;try{const data=await scope.fetch('/api/report/account',{query:{from:startOfDay(selectedDate.value.start).toISOString(),to:endOfDay(selectedDate.value.end).toISOString()}});if(v===version)report.value=data;}catch(e:any){if(v===version)error.value=e.data?.statusMessage||e.message;}finally{if(v===version)loading.value=false;}}
onMounted(load);watch([selectedDate,scope.readIds],load);
const amount=(n:any)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:report.value?.currency||'INR'}).format(Number(n||0));
const cards=computed(()=>report.value?[
 ['Cash',report.value.balances.cash.closing],['All banks',report.value.balances.bank.closing],['Receivables',report.value.balances.receivable.closing],['Payables',-report.value.balances.payable.closing],['Stock',report.value.balances.stock.closing],['Net assets',report.value.balanceSheet.netAssets]
]:[]);
const columns=[{key:'name',label:'Account'},{key:'type',label:'Type'},{key:'opening',label:'Opening'},{key:'debit',label:'Period debit'},{key:'credit',label:'Period credit'},{key:'closing',label:'Closing'}];
const balance=(n:number)=>`${amount(Math.abs(n))} ${n<0?'Cr':'Dr'}`;
</script>
<template><UDashboardPanelContent class="space-y-5">
 <div class="flex flex-wrap gap-3 items-center justify-between"><h1 class="text-xl font-semibold">Accounts report</h1><CompanyTableFilter /><UPopover><UButton icon="i-heroicons-calendar-days">{{ format(selectedDate.start,'dd MMM yyyy') }} - {{ format(selectedDate.end,'dd MMM yyyy') }}</UButton><template #panel="{close}"><DatePicker v-model="selectedDate" range @update:model-value="close" /></template></UPopover></div>
 <ReportsBasis /><p class="text-xs text-gray-500">Balances are as of the end date. Opening balances are before the start date. All cash and bank accounts are included.</p>
 <UProgress v-if="loading" /><p v-if="error" class="text-red-500">{{ error }}</p>
 <template v-if="report"><div class="grid sm:grid-cols-3 lg:grid-cols-6 gap-3"><UCard v-for="[label,value] in cards" :key="String(label)"><div class="text-xs text-gray-500">{{ label }}</div><div class="text-lg font-semibold">{{ amount(value) }}</div></UCard></div>
 <div class="grid md:grid-cols-2 gap-4"><UCard><template #header>Profit and loss for selected period</template><dl class="space-y-2"><div v-for="[label,value] in [['Sales income (excluding tax)',report.pnl.totalSales],['Other income',report.pnl.otherIncome],['Cost of goods sold',report.pnl.totalCOGS],['Expenses',report.pnl.totalExpenses],['Net profit',report.pnl.netProfit]]" :key="String(label)" class="flex justify-between"><dt>{{ label }}</dt><dd>{{ amount(value) }}</dd></div></dl></UCard>
 <UCard><template #header>Cash and bank movement</template><dl class="space-y-2"><div v-for="[label,value] in [['Opening',report.balances.total.opening],['Receipts',report.cashFlow.received],['Payments',report.cashFlow.paid],['Closing',report.balances.total.closing]]" :key="String(label)" class="flex justify-between"><dt>{{ label }}</dt><dd>{{ amount(value) }}</dd></div></dl><p class="text-xs text-gray-500 mt-3">Internal transfers between cash and bank accounts cancel out.</p></UCard></div>
 <UCard :ui="{body:{padding:'p-0 sm:p-0'}}"><UTable :columns="columns" :rows="report.accounts"><template #name-data="{row}"><NuxtLink class="text-primary" :to="`/accountant/chart-of-accounts?entryCompany=${row.company_id}&account=${row.id}`">{{ row.name }}</NuxtLink></template><template #opening-data="{row}">{{ balance(row.opening) }}</template><template #closing-data="{row}">{{ balance(row.closing) }}</template><template #debit-data="{row}">{{ amount(row.debit) }}</template><template #credit-data="{row}">{{ amount(row.credit) }}</template></UTable></UCard>
 </template>
</UDashboardPanelContent></template>
