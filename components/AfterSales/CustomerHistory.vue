<script setup lang="ts">
import { billingErrorMessage } from '~/utils/billing-error'
import { serviceDate, serviceLabel, serviceStatusColor } from '~/utils/after-sales-display'
import { useAfterSalesSearch } from '~/composables/useAfterSalesSearch'

const props = defineProps<{ clientId: string }>()
const scope = useCompanyScope()
const customer = ref<any>(null), rows = ref<any[]>([]), total = ref(0)
const q = ref(''), page = ref(1), pageSize = ref(20), loading = ref(false), error = ref('')
let version = 0
async function load() {
  const token = ++version
  loading.value = true; error.value = ''
  try {
    const data = await scope.fetch<any>('/api/after-sales/customers/' + encodeURIComponent(props.clientId), {
      query: { q: q.value, page: page.value, pageSize: pageSize.value }
    })
    if (token !== version) return
    customer.value = data.customer; rows.value = data.rows; total.value = data.total
    const last = Math.max(1, Math.ceil(data.total / pageSize.value))
    if (page.value > last) page.value = last
  } catch (e) {
    if (token === version) { customer.value = null; rows.value = []; total.value = 0; error.value = billingErrorMessage(e) }
  } finally { if (token === version) loading.value = false }
}
async function firstPage() { if (page.value !== 1) page.value = 1; else await load() }
useAfterSalesSearch(q, firstPage)
watch(page, load)
watch(pageSize, firstPage)
watch(() => [props.clientId, scope.companyId.value], () => {
  ++version; customer.value = null; rows.value = []; total.value = 0; q.value = ''; firstPage()
})
onMounted(load)
onBeforeUnmount(() => { ++version })
const columns = [{ key: 'name', label: 'Product' }, { key: 'barcode', label: 'Barcode' },
  { key: 'purchased_on', label: 'Purchased' }, { key: 'invoice_code', label: 'Invoice' },
  { key: 'quantity', label: 'Quantity' }, { key: 'agreements', label: 'Plans / coverage' },
  { key: 'status', label: 'Status' }, { key: 'actions', label: 'Actions' }]
function actions(row: any) {
  return [[{ label: 'View', icon: 'i-heroicons-eye',
    to: { path: '/after-sales/products/' + row.customer_product_id, query: { entryCompany: scope.companyId.value } } }]]
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <CompanyFormField toolbar locked/>
    <div class="mb-5"><UButton to="/client" color="gray" variant="link" icon="i-heroicons-arrow-left" class="p-0">Clients</UButton></div>
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><h1 class="text-xl font-semibold text-gray-900 dark:text-white">Service history</h1>
        <p v-if="customer" class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ customer.name }}<span v-if="customer.phone"> · {{ customer.phone }}</span></p>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Purchased products and registered client units. Open a registered unit to manage its claims, visits and invoices.</p>
      </div>
      <UButton :to="{path:'/after-sales',query:{clientId,entryCompany:scope.companyId.value}}" color="gray" icon="i-heroicons-wrench-screwdriver">Service workspace</UButton>
    </div>
    <UAlert v-if="error" role="alert" color="red" variant="soft" :title="error" class="mb-4"><template #actions><UButton color="red" variant="ghost" @click="load">Retry</UButton></template></UAlert>
    <UCard :ui="{body:{padding:'',base:'divide-y divide-gray-200 dark:divide-gray-700'}}">
      <template #header><div class="flex flex-wrap items-center justify-between gap-3">
        <UInput v-model="q" icon="i-heroicons-magnifying-glass" placeholder="Search product, barcode or invoice" aria-label="Search client purchases" class="w-full sm:w-80" @keyup.enter="firstPage"/>
        <div class="flex gap-2"><UButton color="gray" variant="ghost" :disabled="!q" @click="q=''">Reset</UButton><UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="loading" aria-label="Refresh client purchases" @click="load"/></div>
      </div></template>
      <div class="flex items-center gap-2 px-4 py-3"><span class="text-sm text-gray-500 dark:text-gray-400">Rows per page:</span><USelect :model-value="pageSize" :options="[10,20,50]" size="xs" class="w-20" aria-label="Client purchases per page" @update:model-value="pageSize=Number($event)"/></div>
      <UTable :rows="rows" :columns="columns" :loading="loading" class="w-full">
        <template #name-data="{row}"><div class="max-w-xs"><p class="font-medium">{{row.name}}</p><p v-if="row.reference" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{row.reference}}</p><p v-if="row.serial_number" class="mt-1 text-xs text-gray-500 dark:text-gray-400">Serial: {{row.serial_number}}</p></div></template>
        <template #barcode-data="{row}">{{row.barcode || '—'}}</template>
        <template #purchased_on-data="{row}">{{serviceDate(row.purchased_on)}}</template>
        <template #invoice_code-data="{row}"><UButton v-if="row.bill_id" :to="{path:'/erp/edit/'+row.bill_id,query:{entryCompany:scope.companyId.value}}" color="gray" variant="link" class="p-0">{{row.invoice_code || 'Invoice'}}</UButton><span v-else>Manual registration</span></template>
        <template #agreements-data="{row}"><div class="flex max-w-xs flex-wrap gap-1"><UBadge v-for="(agreement,index) in row.agreements" :key="index" color="gray" variant="subtle" size="xs">{{agreement.name}}</UBadge><span v-if="!row.agreements.length" class="text-xs text-gray-500 dark:text-gray-400">No registered coverage</span></div></template>
        <template #status-data="{row}"><UBadge :color="row.status==='UNREGISTERED'?'gray':serviceStatusColor(row.status)" variant="subtle">{{row.status==='UNREGISTERED'?'Not registered':serviceLabel(row.status)}}</UBadge></template>
        <template #actions-data="{row}"><UDropdown v-if="row.customer_product_id" :items="actions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" :aria-label="'Service actions for '+row.name"/></UDropdown><span v-else class="text-xs text-gray-500 dark:text-gray-400">Register for service first</span></template>
        <template #empty-state><div class="py-10 text-center"><UIcon name="i-heroicons-shopping-bag" class="mb-3 h-8 w-8 text-gray-400"/><p class="text-sm font-medium">{{q?'No matching purchases':'No purchased products found'}}</p><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{q?'Try another product, barcode or invoice.':'New purchases and manual service registrations will appear here.'}}</p></div></template>
      </UTable>
      <template #footer><div class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-gray-500 dark:text-gray-400">Showing {{total?(page-1)*pageSize+1:0}}–{{Math.min(page*pageSize,total)}} of {{total}}</p><UPagination v-model="page" :page-count="pageSize" :total="total" :max="5"/></div>
        <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">Older purchases without an after-sales registration are listed without creating agreements. Use Register an earlier purchase in Service workspace when needed.</p>
      </template>
    </UCard>
  </UDashboardPanelContent>
</template>
