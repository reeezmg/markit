<script setup lang="ts">
import { receiptStatus } from '~/utils/bill-credit'
const props = defineProps<{modelValue:boolean;bill:any}>()
const emit = defineEmits(['update:modelValue','saved'])
const open = computed({get:()=>props.modelValue,set:(v)=>emit('update:modelValue',v)})
const state = ref<any>(null), error = ref(''), loading = ref(false), saving = ref(false)
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const amount = ref<number|string>(0), date = ref(today()), method = ref('Cash'), accountId = ref(''), reference = ref('')
const reversal = ref<any>(null), reversalId = ref('')
const key = () => `bill-credit-receipt:${props.bill?.companyId}:${props.bill?.id}`
const accounts = computed(()=> (state.value?.accounts || []).filter((a:any)=>a.type === (method.value === 'Cash' ? 'CASH' : 'BANK')).map((a:any)=>({label:a.name,value:a.id})))
watch(method,()=>{if (!accounts.value.some((a:any)=>a.value===accountId.value)) accountId.value=accounts.value[0]?.value || ''})
let version = 0
async function load() {
  const request = ++version
  state.value=null;error.value='';loading.value=true
  try {
    const response = await $fetch<any>('/api/billSale/receipts',{headers:{'x-company-id':props.bill.companyId},query:{billId:props.bill.id}})
    if(request===version) state.value=response
  } catch(e:any) {if(request===version) error.value=e.data?.statusMessage || e.message}
  finally {if(request===version) loading.value=false}
}
watch(()=>[props.modelValue,props.bill?.id,props.bill?.companyId],async()=>{
  if(!props.modelValue || !props.bill?.id) {++version;return}
  reversal.value=null;date.value=today();method.value='Cash';reference.value='';accountId.value=''
  await load()
  amount.value=state.value?.outstanding || 0
  accountId.value=accounts.value[0]?.value || ''
  try {
    const draft=JSON.parse(localStorage.getItem(key()) || 'null')
    if(draft) {amount.value=draft.amount;date.value=draft.paymentDate;method.value=draft.paymentMethod;accountId.value=draft.accountId;reference.value=draft.reference}
  } catch { /* The current outstanding remains available if the local draft is invalid. */ }
},{immediate:true})
async function save() {
  if(saving.value)return
  saving.value=true;error.value=''
  try {
    const payload={billId:props.bill.id,companyId:props.bill.companyId,amount:amount.value,paymentDate:date.value,paymentMethod:method.value,accountId:accountId.value,reference:reference.value}
    const previous=JSON.parse(localStorage.getItem(key()) || 'null')
    const fingerprint=JSON.stringify(payload)
    const requestId=previous?.fingerprint===fingerprint ? previous.requestId : crypto.randomUUID()
    localStorage.setItem(key(),JSON.stringify({...payload,fingerprint,requestId}))
    await $fetch('/api/billSale/receipts',{method:'POST',headers:{'x-company-id':props.bill.companyId},body:{...payload,requestId}})
    localStorage.removeItem(key())
    emit('saved');await load();amount.value=state.value?.outstanding || 0
  }catch(e:any){error.value=e.data?.statusMessage || e.message}
  finally{saving.value=false}
}
function beginReversal(payment:any) {reversal.value=payment;reversalId.value=crypto.randomUUID();date.value=today()}
async function reverse() {
  if(saving.value)return
  saving.value=true;error.value=''
  try {
    await $fetch('/api/billSale/reverseReceipt',{method:'POST',headers:{'x-company-id':props.bill.companyId},body:{billId:props.bill.id,companyId:props.bill.companyId,receiptId:reversal.value.id,paymentDate:date.value,requestId:reversalId.value}})
    reversal.value=null;emit('saved');await load();amount.value=state.value?.outstanding || 0
  }catch(e:any){error.value=e.data?.statusMessage || e.message}
  finally{saving.value=false}
}
</script>

<template>
  <UModal v-model="open" :prevent-close="saving">
    <UCard>
      <template #header><div class="font-semibold">Credit bill payments · {{ state?.invoiceNumber || bill?.invoiceNumber }}</div></template>
      <div class="space-y-4">
        <p v-if="loading">Loading payments…</p>
        <UAlert v-if="error" color="red" :description="error" title="Payment could not be completed" />
        <template v-if="state">
          <p class="font-semibold">Outstanding: {{ state.outstanding.toFixed(2) }}</p>
          <p class="text-sm text-gray-500">Payments use their own date. The original invoice and sales date stay unchanged.</p>
          <div v-if="state.outstanding > 0 && !reversal" class="space-y-3">
            <UFormGroup label="Amount received"><UInput v-model="amount" type="number" min="0.01" step="0.01" :max="state.outstanding" :disabled="saving" /></UFormGroup>
            <UFormGroup label="Payment date"><UInput v-model="date" type="date" :max="today()" :disabled="saving" /></UFormGroup>
            <UFormGroup label="Payment method"><USelect v-model="method" :options="['Cash','UPI','Card','Bank','Cheque']" :disabled="saving" /></UFormGroup>
            <UFormGroup label="Receiving account"><USelect v-model="accountId" :options="accounts" :disabled="saving" /></UFormGroup>
            <UFormGroup label="Reference (optional)"><UInput v-model="reference" maxlength="100" :disabled="saving" /></UFormGroup>
            <UButton :loading="saving" :disabled="loading || !accountId" label="Record payment" @click="save" />
          </div>
          <div v-if="reversal" class="space-y-3">
            <p>Reverse {{ Number(reversal.amount).toFixed(2) }} received by {{ reversal.payment_mode }}. This reopens the amount due and records an opposite account movement.</p>
            <UFormGroup label="Reversal date"><UInput v-model="date" type="date" :max="today()" :disabled="saving" /></UFormGroup>
            <UButton color="red" label="Confirm reversal" :loading="saving" @click="reverse" />
            <UButton color="white" label="Cancel reversal" :disabled="saving" @click="reversal=null" />
          </div>
          <div v-for="p in state.payments" :key="p.id" class="flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <div>{{ new Date(p.payment_date).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) }} · {{ p.payment_mode }} · {{ Number(p.amount).toFixed(2) }}<br><span class="text-gray-500">{{ p.payment_reference }} {{ p.status !== receiptStatus ? ' · Reversed' : '' }}</span></div>
            <UButton v-if="p.status === receiptStatus" color="red" variant="ghost" label="Reverse" :disabled="saving" @click="beginReversal(p)" />
          </div>
        </template>
      </div>
      <template #footer><UButton color="white" label="Close" :disabled="saving" @click="open=false" /></template>
    </UCard>
  </UModal>
</template>
