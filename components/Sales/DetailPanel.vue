<script setup lang="ts">
import { billingErrorMessage } from '~/utils/billing-error'
import { historySnapshot } from '~/utils/sales-history'

const props = defineProps<{bill:any;revision?:number;fetcher:(url:string,options?:any)=>Promise<any>}>()
const emit = defineEmits(['close','print'])
const tab = ref('bill')
const receipt = ref<any>(null), receiptError = ref(''), receiptLoading = ref(false)
const histories = ref<any[]>([]), historyTotal = ref(0), historyPage = ref(1)
const historyError = ref(''), historyLoading = ref(false)
let receiptVersion=0, historyVersion=0
const headers = () => ({'x-company-id':props.bill.companyId,'x-company-filter':props.bill.companyId})
async function loadBill() {
  const version=++receiptVersion
  receipt.value=null;receiptError.value='';receiptLoading.value=true
  try {
    const result=await props.fetcher('/api/billSale/receipt',{headers:headers(),query:{id:props.bill.id}})
    if(version===receiptVersion) receipt.value=result
  } catch(error) {if(version===receiptVersion) receiptError.value=billingErrorMessage(error)}
  finally {if(version===receiptVersion) receiptLoading.value=false}
}
async function loadHistory() {
  const version=++historyVersion
  histories.value=[];historyTotal.value=0;historyError.value='';historyLoading.value=true
  try {
    const result=await props.fetcher('/api/billSale/history',{headers:headers(),query:{id:props.bill.id,page:historyPage.value}})
    if(version===historyVersion) {histories.value=result.rows;historyTotal.value=result.total}
  } catch(error) {if(version===historyVersion) historyError.value=billingErrorMessage(error)}
  finally {if(version===historyVersion) historyLoading.value=false}
}
watch(()=>[props.bill.id,props.bill.companyId],()=>{
  tab.value='bill';historyPage.value=1;++historyVersion
  histories.value=[];historyTotal.value=0;historyError.value='';historyLoading.value=false
  void loadBill()
},{immediate:true})
watch(()=>props.revision,()=>{void loadBill();if(tab.value==='history') void loadHistory()})
watch(tab,value=>{if(value==='history') void loadHistory()})
watch(historyPage,()=>{if(tab.value==='history') void loadHistory()})
onBeforeUnmount(()=>{++receiptVersion;++historyVersion})
const money = (value:any) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value ?? 0))
const date = (value:any) => new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})
</script>

<template>
  <section class="min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" aria-label="Selected sale">
    <header class="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50">
      <div class="min-w-0"><h2 class="truncate text-sm font-semibold">{{ bill.invoiceCode || `Bill #${bill.invoiceNumber}` }}</h2><p class="truncate text-xs text-gray-500">{{ bill.client?.name || bill.client?.phone || 'Walk-in customer' }}</p></div>
      <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" aria-label="Close bill details" @click="emit('close')" />
    </header>
    <div role="tablist" aria-label="Bill details" class="flex gap-4 border-b border-gray-200 px-4 dark:border-gray-800">
      <button v-for="item in [{key:'bill',label:'Bill'},{key:'history',label:'History'}]" :id="`sale-tab-${item.key}`" :key="item.key" role="tab" type="button" :aria-selected="tab===item.key" :aria-controls="`sale-panel-${item.key}`" class="border-b-2 px-3 py-3 text-sm font-medium" :class="tab===item.key?'border-primary-500 text-primary-600':'border-transparent text-gray-500'" @click="tab=item.key">{{ item.label }}</button>
    </div>
    <div v-if="tab==='bill'" id="sale-panel-bill" role="tabpanel" aria-labelledby="sale-tab-bill" class="max-h-[75vh] overflow-auto p-4">
      <p v-if="receiptLoading" role="status">Loading bill…</p>
      <div v-else-if="receiptError" class="space-y-3"><UAlert color="red" title="Could not load bill" :description="receiptError" /><UButton color="gray" @click="loadBill">Retry</UButton></div>
      <template v-else-if="receipt"><div class="mb-4 flex justify-end"><UButton icon="i-heroicons-printer" color="gray" @click="emit('print')">Print</UButton></div><ThermalReceipt :key="`${bill.companyId}:${bill.id}:${revision}`" :data="receipt" /></template>
    </div>
    <div v-else id="sale-panel-history" role="tabpanel" aria-labelledby="sale-tab-history" class="max-h-[75vh] overflow-auto p-4">
      <p class="mb-4 text-xs text-gray-500">Recorded bill snapshots, newest first. Expand a record to see its saved items and payment details.</p>
      <p v-if="historyLoading" role="status">Loading history…</p>
      <div v-else-if="historyError" class="space-y-3"><UAlert color="red" title="Could not load history" :description="historyError" /><UButton color="gray" @click="loadHistory">Retry</UButton></div>
      <p v-else-if="!histories.length" class="text-sm text-gray-500">No bill history recorded.</p>
      <div v-else class="space-y-3">
        <details v-for="record in histories" :key="record.id" class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <summary class="cursor-pointer text-sm"><span class="font-medium">{{ record.operation }}</span> · {{ date(record.changedAt) }}<span class="ml-2 font-semibold">{{ money(historySnapshot(record.data).grandTotal) }}</span></summary>
          <div class="mt-3 space-y-3 text-sm">
            <p>{{ historySnapshot(record.data).paymentMethod }} · {{ record.data.payment_status ?? record.data.paymentStatus }}</p>
            <p v-for="(part,index) in historySnapshot(record.data).splitPayments" :key="index">{{ part.method }}: {{ money(part.amount) }}</p>
            <div class="overflow-auto"><table class="w-full text-left text-xs"><thead><tr><th class="py-2">Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody><tr v-for="(entry,index) in historySnapshot(record.data).entries" :key="index" class="border-t border-gray-100 dark:border-gray-800"><td class="py-2 pr-2">{{ entry.name || entry.barcode || entry.category?.name || 'Item' }}</td><td class="pr-2">{{ entry.qty }}</td><td class="pr-2">{{ money(entry.rate) }}</td><td>{{ money(entry.value) }}</td></tr></tbody></table></div>
            <p v-if="record.data.notes" class="whitespace-pre-wrap">{{ record.data.notes }}</p>
          </div>
        </details>
      </div>
      <UPagination v-if="!historyLoading && !historyError && historyTotal>20" v-model="historyPage" :page-count="20" :total="historyTotal" class="mt-4" />
    </div>
  </section>
</template>
