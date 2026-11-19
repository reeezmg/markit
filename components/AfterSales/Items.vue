<script setup lang="ts">
import { useAfterSalesSearch } from "~/composables/useAfterSalesSearch"
import { serviceCurrency, serviceMatches } from '~/utils/after-sales-display'
import { billingErrorMessage } from '~/utils/billing-error'
const scope = useCompanyScope('form', true)
await scope.ready
const loading=ref(false), status=ref('')
const q = ref(''), error = ref(''), busy = ref(false), tab = ref('charges')
const catalog = ref<any>({ charges: [], products: [] }), form = ref<any>(null)
const productLink = (id?: string) => ({ path: id ? '/products/edit/' + id : '/products/add',
  query: { entryCompany: scope.companyId.value, serviceProduct: 'true', returnTo: '/after-sales/items' } })
let version=0
async function load() {
  const token=++version
  loading.value = true; error.value = ''
  try { const result=await scope.fetch('/api/after-sales/catalog', { query: { q:q.value, includeArchived: 'true' } });if(token===version)catalog.value=result }
  catch (e) { if(token===version)error.value = billingErrorMessage(e) } finally { if(token===version)loading.value = false }
}
onMounted(load)
useAfterSalesSearch(q,load)
watch(scope.companyId, () => { form.value = null; catalog.value={charges:[],products:[]}; void load() })
watch(tab,()=>{q.value='';status.value='';form.value=null})
function edit(charge?: any) {
  form.value = charge ? structuredClone(toRaw(charge)) : { name: '', description: '', rate: 0, tax: 0, unit: 'Service', archived: false }
}
async function save(value = form.value) {
  busy.value = true; error.value = ''
  try { await scope.fetch('/api/after-sales/catalog/charges', { method: 'POST', body: value }); form.value = null; await load() }
  catch (e) { error.value = billingErrorMessage(e) } finally { busy.value = false }
}
const currency=computed(()=>scope.auth.session.value?.currency||'INR')
const filtered=computed(()=>(tab.value==='charges'?catalog.value.charges:catalog.value.products).filter((row:any)=>serviceMatches(row,q.value)&&(!status.value||(status.value==='ACTIVE'?(tab.value==='charges'?!row.archived:row.status):(tab.value==='charges'?row.archived:!row.status)))))
const columns=computed(()=>tab.value==='charges'?[{key:'name',label:'Charge',sortable:true},{key:'rate',label:'Rate before tax',sortable:true},{key:'tax',label:'Tax'},{key:'unit',label:'Unit'},{key:'status',label:'Status'},{key:'actions',label:''}]:[{key:'name',label:'Product',sortable:true},{key:'variants',label:'Variants / prices'},{key:'status',label:'Status'},{key:'actions',label:''}])
</script>
<template>
  <UDashboardPanelContent class="pb-24">
    <CompanyFormField toolbar :locked="!!form||busy"/>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 class="text-xl font-semibold text-gray-900 dark:text-white">Service items</h1><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Reusable charges and repair parts for your service invoices.</p></div><UButton v-if="tab==='charges'" icon="i-heroicons-plus" :disabled="busy" @click="edit()">New charge</UButton><UButton v-else :to="productLink()" icon="i-heroicons-plus">Add service product</UButton></div>
    <UAlert v-if="error" role="alert" color="red" variant="soft" icon="i-heroicons-exclamation-circle" :title="error" class="mb-4"/>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div class="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="Service item type"><UButton v-for="item in [{key:'charges',label:'Charges'},{key:'products',label:'Service products'}]" :key="item.key" color="gray" :variant="tab===item.key?'solid':'ghost'" :class="{'bg-white dark:bg-gray-700 shadow-sm':tab===item.key}" :aria-pressed="tab===item.key" :disabled="busy" @click="tab=item.key">{{item.label}}</UButton></div><p class="text-sm text-gray-500 dark:text-gray-400">{{tab==='charges'?'Labour, inspection, transport and other fees':'Shared with your regular product inventory'}}</p></div>
    <AfterSalesRecordTable v-model:search="q" :key="tab" :rows="filtered" :columns="columns" :loading="loading" search-placeholder="Search service items" :empty-label="tab==='charges'?'No service charges found':'No service products found'" :empty-description="tab==='charges'?'Create a reusable charge, or add a custom charge directly to a service.':'Add a product and mark it as a service product / repair part.'" @refresh="load" @search="load">
      <template #filters><USelect v-model="status" :options="[{value:'',label:'All statuses'},{value:'ACTIVE',label:'Active'},{value:'INACTIVE',label:tab==='charges'?'Archived':'Inactive'}]" aria-label="Item status" class="w-36"/></template>
      <template #name-data="{row}"><p class="font-medium text-gray-900 dark:text-white">{{row.name}}</p><p class="mt-1 max-w-sm truncate text-xs text-gray-500 dark:text-gray-400">{{tab==='charges'?row.description:'PROD-'+row.product_no}}</p></template><template #rate-data="{row}"><span class="tabular-nums">{{serviceCurrency(row.rate,currency)}}</span></template><template #tax-data="{row}">{{row.tax}}%</template><template #variants-data="{row}"><div v-for="variant in row.variants" :key="variant.id" class="text-sm">{{variant.name||'Standard'}} - {{serviceCurrency(variant.rate,currency)}} / {{variant.unit}}</div><span v-if="!row.variants.length" class="text-gray-400">No variants</span></template><template #status-data="{row}"><UBadge :color="(tab==='charges'?!row.archived:row.status)?'green':'gray'" variant="subtle" size="xs">{{tab==='charges'?(row.archived?'Archived':'Active'):(row.status?'Active':'Inactive')}}</UBadge></template><template #actions-data="{row}"><div class="flex items-center justify-end gap-1"><UButton v-if="tab==='charges'" color="gray" variant="ghost" icon="i-heroicons-pencil-square" @click="edit(row)">Edit</UButton><UButton v-else :to="productLink(row.id)" color="gray" variant="ghost" icon="i-heroicons-pencil-square">Edit product</UButton><UDropdown v-if="tab==='charges'" :items="[[{label:row.archived?'Restore':'Archive',icon:'i-heroicons-archive-box',click:()=>save({...row,archived:!row.archived})}]]"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" aria-label="Charge actions" :disabled="busy"/></UDropdown></div></template><template #empty-actions><UButton v-if="tab==='charges'" icon="i-heroicons-plus" @click="edit()">New charge</UButton><UButton v-else :to="productLink()" icon="i-heroicons-plus">Add service product</UButton></template>
    </AfterSalesRecordTable>
    <UModal :model-value="!!form" :prevent-close="busy" :ui="{width:'sm:max-w-xl'}" @update:model-value="value=>{if(!value&&!busy)form=null}"><UCard v-if="form"><template #header><div class="flex items-center justify-between"><h2 class="font-semibold">{{form.id?'Edit charge':'New charge'}}</h2><UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close charge" :disabled="busy" @click="form=null"/></div></template><form id="service-charge-form" class="space-y-4" @submit.prevent="save()"><fieldset :disabled="busy" class="grid grid-cols-1 gap-4 sm:grid-cols-2"><UFormGroup label="Category" class="sm:col-span-2" help="Assigned automatically. If missing, it is created when you save the charge."><UInput :model-value="catalog.chargeCategory?.name || 'Service Charges'" disabled aria-label="Service charge category"/></UFormGroup><UFormGroup label="Charge name" required class="sm:col-span-2"><UInput v-model="form.name" required maxlength="500" placeholder="e.g. Labour charge" autofocus/></UFormGroup><UFormGroup label="Default rate before tax" required><UInput v-model.number="form.rate" required type="number" min="0" step="0.01"/></UFormGroup><UFormGroup label="Tax %" required><UInput v-model.number="form.tax" required type="number" min="0" max="100" step="0.01"/></UFormGroup><UFormGroup label="Unit" required class="sm:col-span-2"><UInput v-model="form.unit" required maxlength="50" placeholder="e.g. Hour or Service"/></UFormGroup><UFormGroup label="Description" class="sm:col-span-2"><UTextarea v-model="form.description" maxlength="2000"/></UFormGroup></fieldset><p class="text-xs text-gray-500 dark:text-gray-400">Changes apply to new selections. Existing jobs keep their saved charges.</p><UAlert v-if="error" role="alert" color="red" variant="soft" :title="error"/></form><template #footer><div class="flex justify-end gap-2"><UButton color="white" :disabled="busy" @click="form=null">Cancel</UButton><UButton type="submit" form="service-charge-form" :loading="busy">Save charge</UButton></div></template></UCard></UModal>
  </UDashboardPanelContent>
</template>
