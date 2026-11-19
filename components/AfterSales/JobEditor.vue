<script setup lang="ts">
import { newQuoteLine, quoteTotals, quoteMoney } from '~/utils/erp-quote'
import { jobChargeLines, serviceChargeLine } from '~/utils/service-items'
import { serviceLabel, serviceStatusColor, serviceCurrency } from '~/utils/after-sales-display'
import { serviceToday } from '~/utils/after-sales'
import { billingErrorMessage } from '~/utils/billing-error'
const props = defineProps<{ agreement: any; job?: any; occurrenceId?: string }>()
const emit = defineEmits(['saved', 'cancel', 'busy'])
const scope = useCompanyScope(), error = ref(''), busy = ref(false), staff = ref<any[]>([]), charges = ref<any[]>([])
const rules = props.job?.snapshot?.rules || props.agreement.snapshot.rules
const defaultCharge = props.job?.charge ?? (props.agreement.kind === 'MAINTENANCE' && props.agreement.completed_visits < rules.freeVisits ? 0 : rules.charge)
const form = ref<any>({ id: props.job?.id, agreementId: props.agreement.id, occurrenceId: props.occurrenceId || props.job?.occurrence_id, requestKey: crypto.randomUUID(),
  status: props.job?.status || 'OPEN', assignedTo: props.job?.assigned_to || '',
  appointmentOn: props.job?.appointment_on ? new Date(new Date(props.job.appointment_on).getTime() - new Date(props.job.appointment_on).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
  completedOn: props.job?.completed_on ? String(props.job.completed_on).slice(0, 10) : serviceToday(), charge: defaultCharge, tax: props.job?.tax ?? rules.tax,
  details: props.job?.details ? structuredClone(toRaw(props.job.details)) : { complaint: '', assessment: '', resolution: '', notes: '', values: {}, checklist: rules.checklist.map((label: string) => ({ label, done: false })) } })
form.value.details.parts ||= []
form.value.details.charges = jobChargeLines({ ...props.job, charge: defaultCharge, tax: form.value.tax, snapshot: props.job?.snapshot || props.agreement.snapshot, details: form.value.details })
const chargeId = ref(''), partSearch = ref(''), partMatches = ref<any[]>([]), searchingParts=ref(false), partsSearched=ref(false)
let searchVersion=0
watch(busy,value=>emit('busy',value),{immediate:true})
watch(partSearch,()=>{++searchVersion;partMatches.value=[];partsSearched.value=false;searchingParts.value=false})
const total = computed(() => quoteTotals({ items: [...form.value.details.charges, ...form.value.details.parts], discount: 0, discountType: 'amount', adjustment: 0 }).total)
async function findParts() {
  const token=++searchVersion;searchingParts.value=true;partsSearched.value=false;error.value=''
  try { const result=await scope.fetch<any[]>('/api/bill/searchItems', { query: { q: partSearch.value, limit: 10 } });if(token===searchVersion){partMatches.value=result;partsSearched.value=true} }
  catch (e) { if(token===searchVersion)error.value = billingErrorMessage(e) }
  finally{if(token===searchVersion)searchingParts.value=false}
}
function addPart(p: any) {
  form.value.details.parts.push({ ...newQuoteLine(crypto.randomUUID()), variantId: p.variant.id,
    name: [p.variant.product?.name, p.variant.name].filter(Boolean).join(' · '), barcode: p.barcode || '', size: p.size || '', unit: p.variant.unit || 'Nos',
    rate: quoteMoney(Number(p.variant.sprice) * (scope.auth.session.value?.isTaxIncluded === false ? 1 + Number(p.variant.tax) / 100 : 1)), tax: Number(p.variant.tax) })
  partMatches.value = []; partSearch.value = ''
}
function addCharge() {
  const charge = charges.value.find(c => c.id === chargeId.value)
  if (charge) form.value.details.charges.push(serviceChargeLine(charge, crypto.randomUUID()))
  chargeId.value = ''
}
function customCharge() { form.value.details.charges.push({ ...newQuoteLine(crypto.randomUUID()), name: '', unit: 'Service' }) }
const isClaim = props.agreement.kind !== 'MAINTENANCE'
const closed = computed(() => ['COMPLETED', 'RESOLVED', 'REJECTED', 'CANCELLED'].includes(props.job?.status))
const statuses = isClaim ? ['OPEN', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] : ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
onMounted(async () => {
  const results = await Promise.allSettled([scope.fetch('/api/after-sales/staff'), scope.fetch<any>('/api/after-sales/catalog')])
  if (results[0].status === 'fulfilled') staff.value = results[0].value as any[]
  else error.value = billingErrorMessage(results[0].reason)
  if (results[1].status === 'fulfilled') charges.value = results[1].value.charges
  else error.value = billingErrorMessage(results[1].reason)
})
async function save() {
  busy.value = true; error.value = ''
  try { const saved = await scope.fetch('/api/after-sales/jobs', { method: 'POST', body: { ...form.value, appointmentOn: form.value.appointmentOn ? new Date(form.value.appointmentOn).toISOString() : null } }); emit('saved', saved) }
  catch (e) { error.value = billingErrorMessage(e) } finally { busy.value = false }
}
async function invoice() {
  busy.value = true; error.value = ''
  try { const result = await scope.fetch<any>('/api/after-sales/jobs/invoice', { method: 'POST', body: { id: props.job.id } }); await navigateTo({ path: '/erp/edit/' + result.billId, query: { entryCompany: scope.companyId.value } }) }
  catch (e) { error.value = billingErrorMessage(e) } finally { busy.value = false }
}
const currency = computed(() => scope.auth.session.value?.currency || 'INR')
</script>
<template>
  <form class="flex h-full min-h-0 flex-col" @submit.prevent="save">
    <UCard class="flex h-full min-h-0 flex-col" :ui="{rounded:'rounded-none',ring:'',divide:'divide-y divide-gray-200 dark:divide-gray-800',header:{padding:'p-4 sm:px-6'},body:{padding:'p-4 sm:p-6',base:'flex-1 min-h-0 overflow-y-auto'},footer:{padding:'p-4 sm:px-6'}}">
      <template #header><div class="flex items-start justify-between gap-3"><div><h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{isClaim?'Claim':'Service visit'}}</h2><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{job?.snapshot?.name||agreement.snapshot.name}}</p></div><div class="flex items-center gap-2"><UBadge :color="serviceStatusColor(job?.status||form.status)" variant="subtle">{{serviceLabel(job?.status||form.status)}}</UBadge><UButton type="button" color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close service job" :disabled="busy" @click="emit('cancel')"/></div></div></template>
      <div class="space-y-6">
        <UAlert v-if="error" role="alert" color="red" variant="soft" icon="i-heroicons-exclamation-circle" :title="error"/>
        <UAlert v-if="closed" color="gray" variant="soft" icon="i-heroicons-lock-closed" title="This job is closed" :description="job?.bill_id?'View the linked invoice for payment, printing and sharing.':['COMPLETED','RESOLVED'].includes(job?.status)?'Create an invoice below, including for a free service.':'Saved details remain available in service history.'"/>
        <UAlert v-if="rules.instructions" color="primary" variant="soft" icon="i-heroicons-information-circle" title="Service instructions" :description="rules.instructions"/>
        <fieldset :disabled="closed||busy" class="space-y-6">
          <section class="space-y-4"><h3 class="text-sm font-semibold">Job details</h3><div class="grid grid-cols-1 gap-4 sm:grid-cols-2"><UFormGroup label="Status"><USelect v-model="form.status" :options="statuses.map(value=>({value,label:serviceLabel(value)}))"/></UFormGroup><UFormGroup label="Assigned staff"><USelect v-model="form.assignedTo" :options="[{value:'',label:'Unassigned'},...staff.map(p=>({value:p.id,label:p.name}))]"/></UFormGroup><UFormGroup label="Appointment"><UInput v-model="form.appointmentOn" type="datetime-local"/></UFormGroup><UFormGroup v-if="['COMPLETED','RESOLVED'].includes(form.status)" label="Completed on" required><UInput v-model="form.completedOn" type="date" required/></UFormGroup><UFormGroup v-if="isClaim" label="Complaint" required class="sm:col-span-2"><UTextarea v-model="form.details.complaint" required :rows="3"/></UFormGroup><UFormGroup label="Assessment" class="sm:col-span-2"><UTextarea v-model="form.details.assessment" :rows="2"/></UFormGroup><UFormGroup v-if="isClaim" label="Resolution" :required="form.status==='RESOLVED'" class="sm:col-span-2"><UTextarea v-model="form.details.resolution" :required="form.status==='RESOLVED'" :rows="2"/></UFormGroup><UFormGroup label="Notes" class="sm:col-span-2"><UTextarea v-model="form.details.notes" :rows="2" placeholder="Work performed and any follow-up required"/></UFormGroup></div></section>
          <section v-if="form.details.checklist.length" class="space-y-3 border-t border-gray-200 pt-5 dark:border-gray-800"><h3 class="text-sm font-semibold">Checklist</h3><UCheckbox v-for="check in form.details.checklist" :key="check.label" v-model="check.done" :label="check.label"/></section>
          <section v-if="rules.fields.length" class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800"><h3 class="text-sm font-semibold">Readings and answers</h3><AfterSalesValuesEditor v-model="form.details.values" :fields="rules.fields"/></section>
          <fieldset :disabled="!!job?.bill_id" class="space-y-6 border-t border-gray-200 pt-5 dark:border-gray-800">
            <section class="space-y-4"><div><h3 class="text-sm font-semibold">Service charges</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Add labour, inspection or other fees. Rates include tax.</p></div>
              <div v-if="!closed&&!job?.bill_id" class="flex flex-wrap items-center gap-2"><USelect v-model="chargeId" :options="[{value:'',label:'Choose a saved charge'},...charges.map(c=>({value:c.id,label:c.name}))]" aria-label="Saved service charge" class="w-full sm:flex-1"/><UButton type="button" color="gray" :disabled="!chargeId" icon="i-heroicons-plus" @click="addCharge">Add saved charge</UButton><UButton type="button" color="gray" variant="soft" @click="customCharge">Add custom charge</UButton></div>
              <div v-for="(line,index) in form.details.charges" :key="line.id" class="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"><div class="flex items-center justify-between"><p class="text-xs font-medium text-gray-500 dark:text-gray-400">Charge {{index+1}}</p><UButton v-if="!closed&&!job?.bill_id" type="button" color="gray" variant="ghost" icon="i-heroicons-trash" :aria-label="'Remove charge '+(index+1)" @click="form.details.charges.splice(index,1)"/></div><div class="grid grid-cols-2 gap-3 sm:grid-cols-4"><UFormGroup label="Charge name" required class="col-span-2 sm:col-span-4"><UInput v-model="line.name" required maxlength="500"/></UFormGroup><UFormGroup label="Quantity"><UInput v-model.number="line.quantity" type="number" min="0.001" step="0.001" required/></UFormGroup><UFormGroup label="Rate including tax"><UInput v-model.number="line.rate" type="number" min="0" step="0.01" required/></UFormGroup><UFormGroup label="Tax %"><UInput v-model.number="line.tax" type="number" min="0" max="100" step="0.01" required/></UFormGroup><UFormGroup label="Unit"><UInput v-model="line.unit" maxlength="50"/></UFormGroup><UFormGroup label="Description" class="col-span-2 sm:col-span-4"><UInput v-model="line.description" maxlength="2000"/></UFormGroup></div></div>
              <p v-if="!form.details.charges.length" class="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 dark:bg-gray-800">No service charges. This service can still be invoiced at zero.</p>
            </section>
            <section class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800"><div><h3 class="text-sm font-semibold">Repair parts and products</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Regular products and service parts share the same search. Stock moves when invoiced, including free parts.</p></div><div v-if="!closed&&!job?.bill_id" class="flex gap-2"><UInput v-model="partSearch" icon="i-heroicons-magnifying-glass" placeholder="Search all products and repair parts" class="flex-1" @keyup.enter.prevent="findParts"/><UButton type="button" color="gray" :loading="searchingParts" @click="findParts">Find products</UButton></div>
              <p v-if="partsSearched&&!partMatches.length" class="text-sm text-gray-500 dark:text-gray-400">No matching products in stock. Try a product name or barcode.</p><div v-if="partMatches.length" class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700"><UButton v-for="part in partMatches" :key="part.id" type="button" color="gray" variant="ghost" block class="justify-start rounded-none px-4 py-3" icon="i-heroicons-plus" @click="addPart(part)">{{part.variant.product?.name}} - {{part.variant.name}} {{part.size}}</UButton></div>
              <div v-for="(part,index) in form.details.parts" :key="part.id" class="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"><div class="flex items-start justify-between gap-2"><div><p class="text-sm font-medium">{{part.name}}</p><p class="text-xs text-gray-500 dark:text-gray-400">{{part.size}} {{part.barcode}}</p></div><UButton v-if="!closed&&!job?.bill_id" type="button" color="gray" variant="ghost" icon="i-heroicons-trash" :aria-label="'Remove product '+(index+1)" @click="form.details.parts.splice(index,1)"/></div><div class="grid grid-cols-1 gap-3 sm:grid-cols-3"><UFormGroup label="Quantity"><UInput v-model.number="part.quantity" type="number" min="0.001" step="0.001" required/></UFormGroup><UFormGroup label="Rate including tax"><UInput v-model.number="part.rate" type="number" min="0" step="0.01" required/></UFormGroup><UFormGroup label="Tax %"><UInput v-model.number="part.tax" type="number" min="0" max="100" step="0.01" required/></UFormGroup></div></div>
              <p v-if="!form.details.parts.length" class="text-sm text-gray-500 dark:text-gray-400">No repair parts added.</p>
            </section>
          </fieldset>
        </fieldset>
        <UButton v-if="!closed" :to="{path:'/after-sales/items',query:{entryCompany:scope.companyId.value}}" target="_blank" color="gray" variant="link" icon="i-heroicons-arrow-top-right-on-square" class="p-0">Manage service items</UButton>
      </div>
      <template #footer><div class="space-y-3"><div class="flex items-center justify-between gap-3"><span class="text-sm text-gray-500 dark:text-gray-400">Invoice total <span class="text-xs">(including tax)</span></span><strong class="text-lg font-semibold tabular-nums">{{serviceCurrency(total,currency)}}</strong></div><p class="text-xs text-gray-500 dark:text-gray-400">{{closed?'Creating an invoice does not collect a payment.':'Review charges before completing. After saving, choose whether to create an invoice.'}}</p><div class="flex flex-wrap justify-end gap-2"><UButton type="button" color="white" :disabled="busy" @click="emit('cancel')">Close</UButton><UButton v-if="!closed" type="submit" :loading="busy" icon="i-heroicons-check">{{['COMPLETED','RESOLVED'].includes(form.status)?'Complete and save':'Save job'}}</UButton><UButton v-if="job?.id&&!job.bill_id&&['COMPLETED','RESOLVED'].includes(job.status)" type="button" :loading="busy" icon="i-heroicons-document-plus" @click="invoice">Create service invoice</UButton><UButton v-if="job?.bill_id" :to="{path:'/erp/edit/'+job.bill_id,query:{entryCompany:scope.companyId.value}}" icon="i-heroicons-document-text">Open service invoice</UButton></div></div></template>
    </UCard>
  </form>
</template>
