<script setup lang="ts">
import { useAfterSalesSearch } from "~/composables/useAfterSalesSearch"
import { serviceLabel, serviceDate, serviceMatches } from '~/utils/after-sales-display'
import { defaultServiceRules, type ServiceKind } from '~/utils/after-sales'
import { billingErrorMessage } from '~/utils/billing-error'
const props = defineProps<{ kind: ServiceKind }>()
const scope = useCompanyScope('form', true)
await scope.ready
const loading = ref(false)
const rows = ref<any[]>([]), search = ref(''), archived = ref(false), error = ref(''), success = ref(''), busy = ref(false)
const form = ref<any>(null), applyTo = ref(''), reason = ref(''), preview = ref<any>(null), selected = ref<string[]>([])
const title = computed(() => props.kind === 'MAINTENANCE' ? 'Maintenance' : props.kind === 'WARRANTY' ? 'Warranty' : 'Guarantee')
let version = 0
async function load() { const token=++version;loading.value=true;error.value='';try{const result=await scope.fetch<any[]>('/api/after-sales/configurations',{query:{kind:props.kind,q:search.value,includeArchived:String(archived.value)}});if(token===version)rows.value=result}catch(e){if(token===version)error.value=billingErrorMessage(e)}finally{if(token===version)loading.value=false} }
watch(() => [scope.companyId.value, props.kind], () => { form.value=null; rows.value=[]; void load() })
onMounted(load)
useAfterSalesSearch(search,load)
function edit(row?: any, duplicate=false) { form.value=row?structuredClone(toRaw(row)):{kind:props.kind,name:'',rules:defaultServiceRules()}; if(duplicate){delete form.value.id;form.value.name+=' (copy)'} applyTo.value='';reason.value='';preview.value=null;selected.value=[];success.value='' }
function payload() { return {...form.value,applyTo:applyTo.value,reason:reason.value,agreementIds:selected.value,previewToken:preview.value?.token} }
async function review() {busy.value=true;error.value='';try {preview.value=await scope.fetch('/api/after-sales/configurations/preview',{method:'POST',body:payload()});selected.value=[]}catch(e){error.value=billingErrorMessage(e)}finally{busy.value=false}}
async function save(){busy.value=true;error.value='';try{await scope.fetch('/api/after-sales/configurations',{method:'POST',body:payload()});form.value=null;success.value='Configuration saved.';await load()}catch(e){error.value=billingErrorMessage(e)}finally{busy.value=false}}
async function toggle(row:any){busy.value=true;try{await scope.fetch('/api/after-sales/configurations/archive',{method:'POST',body:{id:row.id,archived:!row.archived}});await load()}catch(e){error.value=billingErrorMessage(e)}finally{busy.value=false}}
watch(form,()=>{preview.value=null;selected.value=[]},{deep:true})
watch(applyTo,()=>{preview.value=null;selected.value=[]})
const columns=[{key:'name',label:'Name',sortable:true},{key:'provider',label:'Provider'},{key:'activation',label:'Starts from'},{key:'revision',label:'Revision',sortable:true},{key:'status',label:'Status'},{key:'actions',label:''}]
const filtered=computed(()=>rows.value.filter(row=>serviceMatches(row,search.value)))
const actions=(row:any)=>[[{label:'Duplicate',icon:'i-heroicons-document-duplicate',click:()=>edit(row,true)},{label:row.archived?'Restore':'Archive',icon:row.archived?'i-heroicons-arrow-uturn-left':'i-heroicons-archive-box',click:()=>toggle(row)}]]
const changes=computed(()=>{
 if(!preview.value)return []
 const before={name:preview.value.before?.name,...preview.value.before?.rules},after={name:preview.value.after?.name,...preview.value.after?.rules}
 return Object.keys(after).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({label:key.replace(/([A-Z])/g,' $1'),before:typeof before[key]==='object'?JSON.stringify(before[key]):String(before[key]??'-'),after:typeof after[key]==='object'?JSON.stringify(after[key]):String(after[key]??'-')}))
})

</script>
<template>
  <UDashboardPanelContent class="pb-24">
    <CompanyFormField toolbar :locked="!!form||busy"/>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 class="text-xl font-semibold text-gray-900 dark:text-white">{{title}} plans</h1><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Create reusable {{title.toLowerCase()}} plans and link them to your products.</p></div><UButton v-if="!form" icon="i-heroicons-plus" :disabled="busy" @click="edit()">New {{title.toLowerCase()}}</UButton><UButton v-else color="gray" variant="ghost" icon="i-heroicons-arrow-left" :disabled="busy" @click="form=null">Back to plans</UButton></div>
    <UAlert v-if="error" role="alert" color="red" variant="soft" icon="i-heroicons-exclamation-circle" :title="error" class="mb-4"/>
    <UAlert v-if="success" role="status" color="green" variant="soft" icon="i-heroicons-check-circle" :title="success" class="mb-4"/>
    <form v-if="form" @submit.prevent="save">
      <UCard :ui="{body:{padding:'p-4 sm:p-6'}}"><template #header><div class="flex items-center justify-between gap-3"><h2 class="font-semibold">{{form.id?'Edit':'Create'}} {{title.toLowerCase()}} plan</h2><UBadge v-if="form.id" color="gray" variant="subtle">Revision {{form.revision}}</UBadge></div></template>
        <fieldset :disabled="busy" class="space-y-6"><UFormGroup label="Name" required help="Use a name staff can recognize when linking a product."><UInput v-model="form.name" required maxlength="200" class="max-w-xl"/></UFormGroup><AfterSalesRulesEditor v-model="form.rules" :kind="kind"/>
          <section v-if="form.id" class="space-y-4 border-t border-gray-200 pt-6 dark:border-gray-800"><div><h3 class="font-semibold">Apply this change</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose which clients receive the updated terms.</p></div>
            <div class="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"><URadio v-model="applyTo" value="FUTURE" label="Future sales only" help="Keep all existing client agreements unchanged."/><URadio v-model="applyTo" value="SELECTED" label="Future sales and selected existing agreements" help="Review the affected clients before applying the change."/></div>
            <UFormGroup label="Reason" required><UTextarea v-model="reason" required maxlength="2000" placeholder="Explain why these terms are changing"/></UFormGroup>
            <template v-if="applyTo==='SELECTED'"><UButton type="button" color="gray" icon="i-heroicons-eye" :loading="busy" :disabled="!reason.trim()" @click="review">Preview affected agreements</UButton>
              <div v-if="preview" class="space-y-4"><UAlert color="primary" variant="soft" icon="i-heroicons-information-circle" title="Review and select agreements" description="Completed work, booked visits and issued invoices retain their agreed details."/>
                <div v-if="changes.length" class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"><h4 class="mb-3 text-sm font-semibold">Changed terms</h4><dl class="space-y-3"><div v-for="change in changes" :key="change.label" class="grid gap-1 text-sm sm:grid-cols-3"><dt class="capitalize text-gray-500 dark:text-gray-400">{{change.label}}</dt><dd class="break-words text-gray-500 dark:text-gray-400 line-through">{{change.before}}</dd><dd class="break-words font-medium">{{change.after}}</dd></div></dl></div>
                <UTable :rows="preview.agreements" :columns="[{key:'select',label:''},{key:'customer',label:'Client / unit'},{key:'current',label:'Current due / end'},{key:'proposed',label:'Proposed due / end'},{key:'booked_visits',label:'Booked visits'}]" :empty-state="{icon:'i-heroicons-user-group',label:'No active agreements to amend'}">
                  <template #select-data="{row}"><UCheckbox :model-value="selected.includes(row.id)" :aria-label="'Amend '+row.reference" @update:model-value="value=>selected=value?[...selected,row.id]:selected.filter(id=>id!==row.id)"/></template><template #customer-data="{row}"><p class="font-medium">{{row.customer_name}}</p><p class="text-xs text-gray-500 dark:text-gray-400">{{row.reference}}</p></template><template #current-data="{row}">{{serviceDate(row.next_due)}} / {{serviceDate(row.ends_on)}}</template><template #proposed-data="{row}">{{serviceDate(row.proposedNextDue)}} / {{serviceDate(row.proposedEndsOn)}}</template>
                </UTable><p class="text-sm text-gray-500 dark:text-gray-400">{{selected.length}} agreement(s) selected</p>
              </div>
            </template>
          </section>
        </fieldset>
        <template #footer><div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-gray-500 dark:text-gray-400">{{form.id?'Changes are recorded with your reason.':'Link this plan to products after saving.'}}</p><div class="flex gap-2"><UButton type="button" color="white" :disabled="busy" @click="form=null">Cancel</UButton><UButton type="submit" :loading="busy" :disabled="busy || (form.id && (!applyTo || !reason.trim() || (applyTo==='SELECTED' && (!preview || !selected.length))))">Save configuration</UButton></div></div></template>
      </UCard>
    </form>
    <AfterSalesRecordTable v-else v-model:search="search" :rows="filtered" :columns="columns" :loading="loading" search-placeholder="Search configurations" :empty-label="'No '+title.toLowerCase()+' plans found'" empty-description="Create a reusable plan, then assign it to your products." @refresh="load" @search="load"><template #filters><UCheckbox v-model="archived" label="Include archived" @update:model-value="load"/></template>
      <template #name-data="{row}"><p class="font-medium text-gray-900 dark:text-white">{{row.name}}</p></template><template #provider-data="{row}">{{row.rules.provider||'-'}}</template><template #activation-data="{row}">{{row.rules.activation==='DEFAULT'?'Sale / delivery':serviceLabel(row.rules.activation)}}</template><template #revision-data="{row}"><UBadge color="gray" variant="subtle">{{row.revision}}</UBadge></template><template #status-data="{row}"><UBadge :color="row.archived?'gray':'green'" variant="subtle" size="xs">{{row.archived?'Archived':'Active'}}</UBadge></template>
      <template #actions-data="{row}"><div class="flex items-center justify-end gap-1"><UButton color="gray" variant="ghost" icon="i-heroicons-pencil-square" :disabled="busy" @click="edit(row)">Edit</UButton><UDropdown :items="actions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" aria-label="Plan actions" :disabled="busy"/></UDropdown></div></template><template #empty-actions><UButton icon="i-heroicons-plus" @click="edit()">New {{title.toLowerCase()}}</UButton></template>
    </AfterSalesRecordTable>
  </UDashboardPanelContent>
</template>
