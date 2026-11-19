<script setup lang="ts">
import { billingErrorMessage } from '~/utils/billing-error'
import { receiptStatus } from '~/utils/bill-credit'
import ErpDocumentTable from '~/components/Erp/DocumentTable.vue'
import { documentListDefaults, type DocumentListState } from '~/utils/erp-document-table'
import BillingPreferences from '~/components/Billing/Preferences.vue'
import { emptyBillingPreferences } from '~/utils/billing-preferences'
const props = defineProps<{ payments?: boolean }>()
const scope = useCompanyScope()
await scope.ready
const toast = useToast()
const table = ref(documentListDefaults(props.payments ? 'paymentDate' : 'invoiceDate'))
const route = useRoute()
if (typeof route.query.q === 'string') table.value.q = route.query.q.slice(0,200)
const preferencesOpen = ref(false), preferences = ref(emptyBillingPreferences())
const preferenceCompanyId = computed(() => scope.readIds.value.length === 1 ? scope.readIds.value[0] : scope.companyId.value)
let preferenceVersion = 0
async function loadPreferences() {
  if (props.payments) return
  const version = ++preferenceVersion
  try {
    const result = await scope.fetch<any>('/api/settings/billing-preferences', { query: { document: 'invoice' }, headers: { 'x-company-id': preferenceCompanyId.value } })
    if (version === preferenceVersion) { preferences.value = result.preferences; table.value = { ...table.value, page: 1, pageSize: result.preferences.pageSize } }
  } catch { if (version === preferenceVersion) preferences.value = emptyBillingPreferences() }
}
await loadPreferences()
watch(preferenceCompanyId, loadPreferences)
const busy = ref('')
const receiptOpen = ref(false), receiptBill = ref<any>(null)
const receiptMode = ref<'collect'|'reverse'>('collect')
const picker = ref(false), choices = ref<any[]>([]), choiceSearch = ref(''), choicesLoading = ref(false), choiceError = ref('')
const key = computed(() => `${props.payments?'payments-received':'invoices'}:${scope.readIds.value.join(',')}`)
const newInvoiceTo = computed(()=>({path:'/erp/billing',query:{billingMode:'invoice',entryCompany:scope.readIds.value.length===1?scope.readIds.value[0]:scope.companyId.value}}))
const loadRows = computed(() => {
  const companyId = scope.companyId.value, companyFilter = scope.readIds.value.length === 1 ? scope.readIds.value[0] : '*'
  return (query: DocumentListState) => scope.fetch<any>(`/api/billSale/${props.payments?'payments':'invoices'}`, {
    query, headers: { 'x-company-id': companyId, 'x-company-filter': companyFilter },
  })
})
const { data, pending, error, refresh } = await useAsyncData(key.value, () => loadRows.value(table.value), {
  watch:[table,scope.readIds],default:()=>({rows:[],total:0,summary:{}}),
})
watch(scope.readIds,()=>{table.value={...table.value,page:1}})
const money = (value:any) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value||0))
const day = (value:any) => value ? new Date(value).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : '—'
const columns = computed(()=>(props.payments ? [
  {key:'paymentDate',label:'Date'}, {key:'invoiceNumber',label:'Invoice'}, {key:'clientName',label:'Customer'},
  {key:'amount',label:'Amount'}, {key:'paymentMethod',label:'Method'}, {key:'receivingAccount',label:'Received into'},
  {key:'reference',label:'Reference'}, {key:'status',label:'Status'}, {key:'actions',label:''},
] : [
  {key:'invoiceNumber',label:'Invoice'}, {key:'clientName',label:'Customer'}, {key:'invoiceDate',label:'Issued'},
  {key:'dueDate',label:'Due'}, {key:'grandTotal',label:'Total'}, {key:'amountReceived',label:'Received'},
  {key:'balanceDue',label:'Balance'}, {key:'invoicePaymentStatus',label:'Payment'}, {key:'sendStatus',label:'Sending'}, {key:'actions',label:''},
]).map(column=>({...column,sortable:column.key!=='actions'})))
const filterOptions = computed(()=>props.payments ? [
  {label:'All payments',value:''},{label:'Received',value:receiptStatus},{label:'Reversed',value:'POS_CREDIT_REVERSED'},
] : [
  {label:'All invoices',value:''},{label:'Unpaid (all balances)',value:'unpaid'},{label:'Partially paid',value:'partial'},{label:'Paid',value:'paid'},{label:'Overdue',value:'overdue'},
])
const cards = computed(()=>props.payments ? [
  {label:'Received',value:money(data.value?.summary?.amount),icon:'i-heroicons-banknotes',filter:receiptStatus},
  {label:'Reversed',value:money(data.value?.summary?.reversed),icon:'i-heroicons-arrow-uturn-left',filter:'POS_CREDIT_REVERSED'},
  {label:'Receipts',value:String(data.value?.summary?.count||0),icon:'i-heroicons-document-text'},
] : [
  {label:'Invoice total',value:money(data.value?.summary?.amount),icon:'i-heroicons-document-text',filter:''},
  {label:'Received',value:money(data.value?.summary?.received),icon:'i-heroicons-banknotes'},
  {label:'Balance due',value:money(data.value?.summary?.balance),icon:'i-heroicons-clock',filter:'unpaid'},
  {label:'Overdue',value:money(data.value?.summary?.overdue),icon:'i-heroicons-exclamation-circle',filter:'overdue'},
])
function exportValue(row:any,key:string):string|number {
  if(['amount','grandTotal','amountReceived','balanceDue'].includes(key))return Number(row[key]||0)
  if(['paymentDate','invoiceDate','dueDate'].includes(key))return day(row[key])
  if(key==='invoiceNumber')return row.invoiceCode||row.invoiceNumber
  if(key==='status')return row.status===receiptStatus?'Received':'Reversed'
  return row[key]||''
}
function rowActions(row:any) {
  if(props.payments)return [[{label:'History / reverse',icon:'i-heroicons-clock',click:()=>collect(row,'reverse')}]]
  return [[
    {label:'Record payment',icon:'i-heroicons-banknotes',disabled:Number(row.balanceDue)<=0,click:()=>collect(row)},
    {label:row.sendStatus==='Not sent'?'Send':'Resend',icon:'i-heroicons-paper-airplane',disabled:!!busy.value,click:()=>send(row)},
    {label:'Download PDF',icon:'i-heroicons-arrow-down-tray',disabled:!!busy.value,click:()=>download(row)},
    ...(Number(row.amountReceived)===0 ? [{label:'Edit invoice',icon:'i-heroicons-pencil-square',to:`/erp/edit/${row.id}`}] : []),
    ...(Number(row.amountReceived)>0 ? [{label:'Payment history',icon:'i-heroicons-clock',click:()=>collect(row,'reverse')}] : []),
  ]]
}
function collect(row:any,mode:'collect'|'reverse'='collect') {
  receiptBill.value={...row,id:row.billId || row.id};receiptMode.value=mode;receiptOpen.value=true;picker.value=false
}
async function documentData(row:any) {
  return scope.fetch<any>('/api/billSale/receipt',{headers:{'x-company-id':row.companyId,'x-company-filter':row.companyId},query:{id:row.billId||row.id}})
}
async function download(row:any) {
  if(busy.value)return;busy.value=row.id
  try {
    const details=await documentData(row)
    const {generateThermalReceiptPDF}=await import('~/utils/thermal-receipt.client')
    await generateThermalReceiptPDF(details,`${row.invoiceCode||'Invoice-'+row.invoiceNumber}.pdf`)
  } catch(e) {toast.add({title:'Could not download invoice',description:billingErrorMessage(e),color:'red'})}
  finally {busy.value=''}
}
async function send(row:any) {
  if(busy.value)return;busy.value=row.id
  try {
    const details=await documentData(row)
    if(!details.clientPhone)throw Error('Add a customer phone number before sending.')
    const {shareReceiptPDF}=await import('~/utils/share-receipt.client')
    const share=await shareReceiptPDF(details,row.id)
    const result=await scope.fetch<any>('/api/whatsapp/send-payment-template',{method:'POST',headers:{'x-company-id':row.companyId},body:{
      companyId:row.companyId,phone:details.clientPhone,name:details.clientName,billName:details.companyName,
      amount:details.grandTotal,paymentDate:details.date,receiptId:share.receiptId,
    }})
    if(!result.success)throw Error('Invoice could not be sent. Retry sending this saved invoice.')
    toast.add({title:result.trackingWarning?'Invoice sent; sending history could not be updated.':'Invoice sent',color:result.trackingWarning?'orange':'green'})
  } catch(e) {toast.add({title:'Invoice not sent',description:billingErrorMessage(e),color:'red'})}
  finally {busy.value='';await refresh()}
}
let choiceTimer: ReturnType<typeof setTimeout> | undefined, choiceVersion=0
async function loadChoices() {
  const version=++choiceVersion;choicesLoading.value=true;choiceError.value=''
  try {
    const result=await scope.fetch<any>('/api/billSale/invoices',{query:{q:choiceSearch.value,state:'unpaid',collectible:'1'}})
    if(version===choiceVersion)choices.value=result.rows
  } catch(e) {if(version===choiceVersion)choiceError.value=billingErrorMessage(e)}
  finally {if(version===choiceVersion)choicesLoading.value=false}
}
watch(choiceSearch,()=>{clearTimeout(choiceTimer);choiceTimer=setTimeout(loadChoices,250)})
function openPicker() {picker.value=true;choiceSearch.value='';choices.value=[];void loadChoices()}
onBeforeUnmount(()=>{clearTimeout(choiceTimer);choiceVersion++;preferenceVersion++})
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 class="text-xl font-semibold">{{ payments?'Payments received':'Invoices' }}</h1><p class="mt-1 text-sm text-gray-500">{{ payments?'Dated customer payments, recorded separately from sales.':'Issue invoices, send them to customers and track the balance due.' }}</p></div>
      <div class="flex flex-wrap gap-2">
        <UButton v-if="!payments" color="gray" icon="i-heroicons-cog-6-tooth" @click="preferencesOpen = true">Preference</UButton>
        <UButton v-if="payments" icon="i-heroicons-plus" @click="openPicker">Record payment</UButton>
        <UButton v-else :to="newInvoiceTo" icon="i-heroicons-plus">New invoice</UButton>
      </div>
    </div>
    <UAlert v-if="error" class="mb-4" color="red" title="Could not load records" :description="billingErrorMessage(error)" />
    <ErpDocumentTable v-model="table" :title="payments?'Payments received':'Invoices'" :storage-key="`erp-${payments?'payments':'invoices'}-columns:${scope.companyId.value}`" :rows="data?.rows||[]" :total="data?.total||0" :columns="columns" :loading="pending" :cards="preferences.showSummary ? cards : []" :filter-key="payments?'status':'state'" :filter-options="filterOptions" :load-rows="loadRows" :export-value="exportValue" @refresh="refresh()">
      <template #company><CompanyTableFilter /></template>
      <template #invoiceNumber-data="{row}"><UButton variant="link" :padded="false" :to="`/receipt/${row.billId||row.id}?companyId=${row.companyId}`">{{ row.invoiceCode||row.invoiceNumber }}</UButton><p v-if="scope.enabled.value" class="text-xs text-gray-500">{{ row.companyName }}</p></template>
      <template #clientName-data="{row}"><span>{{ row.clientName }}</span><p class="text-xs text-gray-500">{{ row.clientPhone }}</p></template>
      <template #invoiceDate-data="{row}">{{ day(row.invoiceDate) }}</template>
      <template #paymentDate-data="{row}">{{ day(row.paymentDate) }}</template>
      <template #dueDate-data="{row}"><span :class="row.overdue?'font-medium text-red-500':''">{{ day(row.dueDate) }}</span><UBadge v-if="row.overdue" color="red" variant="subtle" size="xs" class="ml-1">Overdue</UBadge></template>
      <template #grandTotal-data="{row}">{{ money(row.grandTotal) }}</template>
      <template #amountReceived-data="{row}">{{ money(row.amountReceived) }}</template>
      <template #balanceDue-data="{row}">{{ money(row.balanceDue) }}</template>
      <template #amount-data="{row}">{{ money(row.amount) }}</template>
      <template #invoicePaymentStatus-data="{row}"><UBadge :color="row.invoicePaymentStatus==='Paid'?'green':row.invoicePaymentStatus==='Partially paid'?'blue':'orange'" variant="subtle">{{ row.invoicePaymentStatus }}</UBadge></template>
      <template #status-data="{row}"><UBadge :color="row.status===receiptStatus?'green':'gray'" variant="subtle">{{ row.status===receiptStatus?'Received':'Reversed' }}</UBadge></template>
      <template #actions-data="{row}">
        <UDropdown :items="rowActions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" :loading="busy===row.id" aria-label="Invoice or payment actions" /></UDropdown>
      </template>
    </ErpDocumentTable>
    <BillingPreferences v-if="!payments" v-model="preferencesOpen" document="invoice" :company-id="preferenceCompanyId" :company-name="scope.companyName(preferenceCompanyId)" @saved="loadPreferences" />
    <BillingCreditReceiptModal v-model="receiptOpen" :bill="receiptBill" :mode="receiptMode" @saved="refresh()" />
    <UModal v-model="picker"><UCard><template #header><h3 class="font-semibold">Choose an unpaid invoice</h3></template>
      <UInput v-model="choiceSearch" placeholder="Search invoice or customer" aria-label="Choose invoice for payment" class="mb-3" />
      <p v-if="choicesLoading" class="text-sm text-gray-500">Loading invoices…</p><p v-if="choiceError" class="text-sm text-red-500">{{ choiceError }}</p>
      <div class="max-h-80 overflow-auto"><button v-for="row in choices" :key="row.id" type="button" class="flex w-full items-center justify-between gap-3 border-b border-gray-200 py-3 text-left text-sm dark:border-gray-800" @click="collect(row)"><span>{{ row.invoiceCode||row.invoiceNumber }} · {{ row.clientName }}<small class="block text-gray-500">{{ row.clientPhone }} · {{ row.companyName }}</small></span><span>{{ money(row.balanceDue) }}</span></button></div>
      <p v-if="!choicesLoading&&!choices.length&&!choiceError" class="text-sm text-gray-500">No matching unpaid invoices.</p>
      <template #footer><UButton color="gray" @click="picker=false">Close</UButton></template>
    </UCard></UModal>
  </div>
</template>
