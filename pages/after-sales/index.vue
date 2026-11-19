<script setup lang="ts">
import { useAfterSalesSearch } from "~/composables/useAfterSalesSearch"
import { serviceJobTotal } from '~/utils/service-items'
import { serviceToday } from '~/utils/after-sales'
import { serviceLabel, serviceStatusColor, serviceDate, serviceCurrency, serviceMatches } from '~/utils/after-sales-display'
import { billingErrorMessage } from '~/utils/billing-error'
const scope = useCompanyScope('form', true); await scope.ready
const route = useRoute(), tab = ref('products'), rows = ref<any[]>([]), due = ref<any[]>([]), jobs = ref<any[]>([]), configs = ref<any[]>([])
const q = ref(''), status = ref(''), error = ref(''), busy = ref(false), processing = ref(false), saving = ref(false), success = ref(''), manual = ref<any>(null)
let version = 0
async function load() {
  const token = ++version; error.value = ''; busy.value = true
  try {
    const context = { clientId: route.query.clientId, billId: route.query.billId, orderId: route.query.orderId }
    const result = await Promise.all([scope.fetch<any[]>('/api/after-sales/products', { query: { ...context, q:tab.value==='products'?q.value:'' } }), scope.fetch<any[]>('/api/after-sales/maintenance', { query: { ...context, q:tab.value==='maintenance'?q.value:'', status: 'DUE' } }), scope.fetch<any[]>('/api/after-sales/jobs', { query: { ...context, q:tab.value==='jobs'?q.value:'' } }), scope.fetch<any[]>('/api/after-sales/configurations')])
    if (token !== version) return
    rows.value = result[0]; due.value = result[1]; jobs.value = result[2]; configs.value = result[3]
  } catch (e) { if (token === version) error.value = billingErrorMessage(e) } finally { if (token === version) busy.value = false }
}
onMounted(load)
useAfterSalesSearch(q,load)
watch(() => [scope.companyId.value, route.query.clientId, route.query.billId, route.query.orderId], () => { manual.value = null; rows.value = []; due.value = []; jobs.value = []; void load() })
watch(tab, () => { q.value = ''; status.value = '' }, {flush:'sync'})
async function refresh() { processing.value = true; error.value = ''; try { const result = await scope.fetch<any>('/api/after-sales/process', { method: 'POST', body: {} }); success.value = `Due services refreshed. ${result.notified} new alerts.`; await load() } catch (e) { error.value = billingErrorMessage(e) } finally { processing.value = false } }
function newManual() { manual.value = { requestKey: crypto.randomUUID(), clientId: '', name: '', purchasedOn: serviceToday(), deliveredOn: '', installedOn: '', evidence: '', serialNumber: '', configurationIds: [] } }
async function register() { saving.value = true; error.value = ''; try { const result = await scope.fetch<any>('/api/after-sales/products', { method: 'POST', body: manual.value }); await navigateTo(link(result.id)) } catch (e) { error.value = billingErrorMessage(e) } finally { saving.value = false } }
const link = (id: string, extra: any = {}) => ({ path: '/after-sales/products/' + id, query: { entryCompany: scope.companyId.value, ...extra } })
const area = (path: string) => ({ path: '/after-sales' + path, query: { entryCompany: scope.companyId.value } })
const contextual = computed(() => !!(route.query.clientId || route.query.billId || route.query.orderId))
const visibleDue = computed(() => due.value)
const visibleJobs = computed(() => jobs.value)
const overdue = computed(() => visibleDue.value.filter(o => o.due_on < serviceToday()).length)
const cards = computed(() => [{ label: 'Client products', value: rows.value.length, icon: 'i-heroicons-cube', tab: 'products' }, { label: 'Due maintenance', value: visibleDue.value.length, icon: 'i-heroicons-calendar-days', tab: 'maintenance' }, { label: 'Overdue visits', value: overdue.value, icon: 'i-heroicons-exclamation-triangle', tab: 'maintenance', status: 'OVERDUE' }, { label: 'Open jobs', value: visibleJobs.value.filter(j => !['COMPLETED','RESOLVED','REJECTED','CANCELLED'].includes(j.status)).length, icon: 'i-heroicons-wrench-screwdriver', tab: 'jobs', status: 'OPEN_WORK' }])
const tabs = [{ key: 'products', label: 'Client products' }, { key: 'maintenance', label: 'Due maintenance' }, { key: 'jobs', label: 'Claims and visits' }]
const statusOptions = computed(() => [{ label: 'All statuses', value: '' }, ...(tab.value === 'products' ? ['ACTIVE','RETURNED','REPLACED','CANCELLED'] : tab.value === 'maintenance' ? ['OVERDUE','UPCOMING'] : ['OPEN_WORK','OPEN','SCHEDULED','APPROVED','IN_PROGRESS','COMPLETED','RESOLVED','REJECTED','CANCELLED']).map(value => ({ label: value === 'OPEN_WORK' ? 'Open jobs' : serviceLabel(value), value }))])
const columns = computed(() => tab.value === 'products' ? [{ key: 'reference', label: 'Product reference', sortable: true }, { key: 'customer_name', label: 'Client', sortable: true }, { key: 'name', label: 'Product', sortable: true }, { key: 'agreements', label: 'Coverage and plans' }, { key: 'status', label: 'Status' }, { key: 'actions', label: '' }] : tab.value === 'maintenance' ? [{ key: 'due_on', label: 'Due date', sortable: true }, { key: 'customer_name', label: 'Client', sortable: true }, { key: 'product_name', label: 'Product' }, { key: 'configuration_name', label: 'Maintenance plan' }, { key: 'actions', label: '' }] : [{ key: 'kind', label: 'Type' }, { key: 'customer_name', label: 'Client', sortable: true }, { key: 'product_name', label: 'Product' }, { key: 'agreement_name', label: 'Plan / coverage' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Amount' }, { key: 'actions', label: '' }])
const filtered = computed(() => (tab.value === 'products' ? rows.value : tab.value === 'maintenance' ? visibleDue.value : visibleJobs.value).filter(row => serviceMatches(row, q.value) && (!status.value || (status.value === 'OVERDUE' ? row.due_on < serviceToday() : status.value === 'UPCOMING' ? row.due_on >= serviceToday() : status.value === 'OPEN_WORK' ? !['COMPLETED','RESOLVED','REJECTED','CANCELLED'].includes(row.status) : row.status === status.value))))
const currency = computed(() => scope.auth.session.value?.currency || 'INR')
</script>
<template>
  <UDashboardPanelContent class="pb-24">
    <CompanyFormField toolbar :locked="!!manual || saving || processing"/>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 class="text-xl font-semibold text-gray-900 dark:text-white">Service workspace</h1><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage client coverage, maintenance visits and claims.</p></div>
      <div class="flex flex-wrap gap-2"><UButton v-if="['admin','manager'].includes(scope.auth.session.value?.role||'')" color="gray" :to="{path:'/connect/whatsapp',query:{entryCompany:scope.companyId.value,tab:'Notifications'}}">WhatsApp notifications</UButton><UButton color="gray" icon="i-heroicons-arrow-path" :loading="processing" :disabled="busy || saving" @click="refresh">Refresh due services</UButton><UButton icon="i-heroicons-plus" :disabled="saving" @click="newManual">Register earlier purchase</UButton></div>
    </div>
    <div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button v-for="card in cards" :key="card.label" type="button" class="rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" :class="tab===card.tab && (status||undefined)===card.status?'border-primary-400 bg-primary-50 dark:bg-primary-950 ring-1 ring-primary-400':'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400'" @click="tab=card.tab;status=card.status||''">
        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400"><UIcon :name="card.icon" class="h-4 w-4"/><span class="text-xs font-medium uppercase tracking-wide">{{card.label}}</span></div><div class="mt-2 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">{{busy?'...':card.value}}</div>
      </button>
    </div>
    <UAlert v-if="error" role="alert" color="red" variant="soft" icon="i-heroicons-exclamation-circle" title="Could not load service data" :description="error" class="mb-4"><template #actions><UButton color="red" variant="ghost" @click="load">Retry</UButton></template></UAlert>
    <UAlert v-if="success" role="status" color="green" variant="soft" icon="i-heroicons-check-circle" :title="success" class="mb-4" :close-button="{icon:'i-heroicons-x-mark',color:'gray',variant:'link'}" @close="success=''"/>
    <UAlert v-if="contextual" color="primary" variant="soft" icon="i-heroicons-funnel" title="Showing the selected client or document" description="Coverage, visits and jobs are limited to this selection." class="mb-4"><template #actions><UButton :to="area('')" color="gray" variant="ghost">Clear filter</UButton></template></UAlert>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div class="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="Service workspace"><UButton v-for="item in tabs" :key="item.key" color="gray" :variant="tab===item.key?'solid':'ghost'" :class="{'bg-white dark:bg-gray-700 shadow-sm':tab===item.key}" :aria-pressed="tab===item.key" @click="tab=item.key">{{item.label}}</UButton></div><UButton :to="area('/items')" color="gray" variant="link" icon="i-heroicons-squares-plus">Manage service items</UButton></div>
    <AfterSalesRecordTable :key="tab" v-model:search="q" :rows="filtered" :columns="columns" :loading="busy" search-placeholder="Search client, product or reference" :empty-label="tab==='maintenance'?'No maintenance visits due':tab==='jobs'?'No claims or service visits':'No client products found'" :empty-description="q||status?'Try another search or status.':tab==='products'?'Covered sales appear here. Register an earlier purchase to add an existing client product.':'New service work appears here when visits or claims are created.'" @refresh="load" @search="load">
      <template #filters><USelect v-model="status" :options="statusOptions" class="w-full sm:w-44" aria-label="Service status"/></template>
      <template #reference-data="{row}"><UButton :to="link(row.id)" color="primary" variant="link" class="p-0 font-medium">{{row.reference}}</UButton><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{row.serial_number||'No serial number'}}</p></template>
      <template #customer_name-data="{row}"><p class="font-medium text-gray-900 dark:text-white">{{row.customer_name}}</p><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{row.phone}}</p></template>
      <template #agreements-data="{row}"><div class="flex max-w-xs flex-wrap gap-1"><UBadge v-for="a in row.agreements" :key="a.id" color="gray" variant="subtle" size="xs">{{a.name}} - {{serviceLabel(a.status)}}</UBadge></div></template>
      <template #product_name-data="{row}"><p>{{row.product_name}}</p><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{row.reference}}</p></template>
      <template #due_on-data="{row}"><p class="font-medium" :class="row.due_on<serviceToday()?'text-red-500':''">{{serviceDate(row.due_on)}}</p><UBadge v-if="row.due_on<serviceToday()" color="red" variant="subtle" size="xs" class="mt-1">Overdue</UBadge></template>
      <template #kind-data="{row}">{{serviceLabel(row.kind)}}</template>
      <template #status-data="{row}"><UBadge :color="serviceStatusColor(row.status)" variant="subtle" size="xs">{{serviceLabel(row.status)}}</UBadge></template>
      <template #total-data="{row}"><span class="tabular-nums">{{serviceCurrency(serviceJobTotal(row),currency)}}</span></template>
      <template #actions-data="{row}"><UButton :to="tab==='products'?link(row.id):tab==='maintenance'?link(row.customer_product_id,{occurrenceId:row.id,agreementId:row.agreement_id,jobId:row.job_id}):link(row.customer_product_id,{jobId:row.id})" color="gray" variant="ghost" trailing-icon="i-heroicons-arrow-right">{{tab==='maintenance'?(row.job_id?'Open visit':'Book visit'):tab==='jobs'?'View job':'View product'}}</UButton></template>
      <template v-if="tab==='products'" #empty-actions><UButton icon="i-heroicons-plus" @click="newManual">Register earlier purchase</UButton></template>
    </AfterSalesRecordTable>
    <UModal :model-value="!!manual" :prevent-close="saving" :ui="{width:'sm:max-w-2xl'}" @update:model-value="value=>{if(!value&&!saving)manual=null}">
      <UCard v-if="manual"><template #header><div class="flex items-center justify-between"><div><h2 class="font-semibold">Register an earlier purchase</h2><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">One registration for each physical client product.</p></div><UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close registration" :disabled="saving" @click="manual=null"/></div></template>
        <form id="register-service-product" class="space-y-5" @submit.prevent="register"><fieldset :disabled="saving" class="space-y-5"><AfterSalesCustomerSelect v-model="manual.clientId" :company-id="scope.companyId.value"/><div class="grid grid-cols-1 gap-4 sm:grid-cols-2"><UFormGroup label="Product name" required><UInput v-model="manual.name" required/></UFormGroup><UFormGroup label="Purchase date" required><UInput v-model="manual.purchasedOn" type="date" required/></UFormGroup><UFormGroup label="Serial number" hint="Optional"><UInput v-model="manual.serialNumber"/></UFormGroup><UFormGroup label="Delivery date" hint="Optional"><UInput v-model="manual.deliveredOn" type="date"/></UFormGroup><UFormGroup label="Installation date" hint="Optional"><UInput v-model="manual.installedOn" type="date"/></UFormGroup><UFormGroup label="Purchase evidence / invoice reference" required class="sm:col-span-2"><UTextarea v-model="manual.evidence" required/></UFormGroup><UFormGroup label="Plans and coverage" required class="sm:col-span-2" help="Choose the agreements to attach to this unit."><USelectMenu v-model="manual.configurationIds" :options="configs.map(c=>({id:c.id,label:serviceLabel(c.kind)+' - '+c.name}))" value-attribute="id" option-attribute="label" multiple placeholder="Select plans and coverage"/></UFormGroup></div></fieldset><UAlert v-if="error" role="alert" color="red" variant="soft" :title="error"/></form>
        <template #footer><div class="flex justify-end gap-2"><UButton color="white" :disabled="saving" @click="manual=null">Cancel</UButton><UButton type="submit" form="register-service-product" :loading="saving" :disabled="!manual.clientId||!manual.configurationIds.length">Register product</UButton></div></template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
