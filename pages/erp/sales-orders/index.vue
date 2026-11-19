<script setup lang="ts">
import DocumentTable from '~/components/Erp/DocumentTable.vue'
import Preferences from '~/components/Quotes/Preferences.vue'
import PrintPreview from '~/components/Quotes/PrintPreview.vue'
import { documentListDefaults, type DocumentListState } from '~/utils/erp-document-table'
import { salesOrderStatuses, salesOrderForEditor } from '~/utils/sales-order'
import { billingErrorMessage } from '~/utils/billing-error'
definePageMeta({ auth: true })
useHead({ title: 'Sales orders · ERP' })
const scope = useCompanyScope('form', true)
await scope.ready
const toast = useToast(), preferencesOpen = ref(false), busy = ref(false), printing = ref<any>(null), deleting = ref<any>(null)
const table = ref(documentListDefaults('orderDate'))
const link = (path: string) => ({ path, query: { entryCompany: scope.companyId.value } })
const editLink = (id: string) => link(`/erp/sales-orders/edit/${encodeURIComponent(id)}`)
const money = (amount: any) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: scope.auth.session.value?.currency || 'INR' }).format(Number(amount || 0))
const loadRows = computed(() => {
  const id = scope.companyId.value
  return (query: DocumentListState) => scope.fetch<any>('/api/sales-orders', { query, headers: { 'x-company-id': id, 'x-company-filter': id } })
})
const { data, pending, error, refresh } = await useAsyncData(`erp-sales-orders:${scope.companyId.value}`, () => loadRows.value(table.value),
  { watch: [table, scope.companyId], default: () => ({ rows: [], total: 0, summary: {} }) })
watch(scope.companyId, () => { table.value = { ...table.value, page: 1 } })
const columns = [
  { key: 'orderNumber', label: 'Sales order', sortable: true }, { key: 'orderDate', label: 'Date', sortable: true },
  { key: 'clientName', label: 'Customer', sortable: true }, { key: 'expectedShipmentDate', label: 'Expected shipment', sortable: true },
  { key: 'status', label: 'Status', sortable: true }, { key: 'total', label: 'Total', sortable: true },
  { key: 'invoiced', label: 'Invoiced' }, { key: 'actions', label: '' },
]
const cards = computed(() => [{ label: 'Total orders', value: money(data.value?.summary?.amount), icon: 'i-heroicons-document-duplicate', filter: '' },
  ...salesOrderStatuses.map(status => ({ label: status[0] + status.slice(1).toLowerCase(), value: money(data.value?.summary?.[status.toLowerCase()]), icon: 'i-heroicons-document-text', filter: status }))])
const exportValue = (row: any, key: string) => key === 'total' ? Number(row.total) : key === 'invoiced' ? row.invoiced ? 'Yes' : 'No' : row[key] || ''
const actions = (row: any) => [[
  { label: 'Edit sales order', to: editLink(row.id), disabled: busy.value },
  { label: 'Print sales order', click: () => preview(row.id), disabled: busy.value },
  { label: 'Delete sales order', click: () => { deleting.value = row }, disabled: busy.value || row.invoiced },
]]
const statusColor = (status: string) => ({ DRAFT: 'gray', CONFIRMED: 'blue', CLOSED: 'green', CANCELLED: 'red' }[status] as any)
async function preview(id: string) {
  busy.value = true
  try { printing.value = salesOrderForEditor(await scope.fetch<any>(`/api/sales-orders/${encodeURIComponent(id)}`)) }
  catch (e) { toast.add({ title: 'Could not load sales order', description: billingErrorMessage(e), color: 'red' }) }
  finally { busy.value = false }
}
async function remove() {
  if (!deleting.value || busy.value) return
  busy.value = true
  try {
    await scope.fetch(`/api/sales-orders/${encodeURIComponent(deleting.value.id)}`, { method: 'DELETE' })
    deleting.value = null; await refresh(); toast.add({ title: 'Sales order deleted', color: 'green' })
  } catch (e) { toast.add({ title: 'Could not delete sales order', description: billingErrorMessage(e), color: 'red' }) }
  finally { busy.value = false }
}
</script>
<template>
  <UDashboardPanelContent class="pb-8"><CompanyFormField toolbar :locked="busy" />
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-xl font-semibold">Sales orders</h1><p class="mt-1 text-sm text-gray-500">Prepare, track and print your customer orders.</p></div><div class="flex gap-2"><UButton color="gray" icon="i-heroicons-adjustments-horizontal" @click="preferencesOpen = true">Preference</UButton><UButton :to="link('/erp/sales-orders/add')" icon="i-heroicons-plus" :disabled="busy">Add sales order</UButton></div></div>
    <UAlert v-if="error" color="red" title="Could not load sales orders" :description="billingErrorMessage(error)" class="mb-4" />
    <DocumentTable v-model="table" title="Sales orders" :storage-key="`erp-sales-orders-columns:${scope.companyId.value}`" :rows="data.rows || []" :total="data.total || 0" :columns="columns" :loading="pending" :cards="cards" filter-key="status" :filter-options="[{ label: 'All statuses', value: '' }, ...salesOrderStatuses.map(value => ({ label: value, value }))]" :load-rows="loadRows" :export-value="exportValue" @refresh="refresh()">
      <template #orderNumber-data="{ row }"><UButton variant="link" :padded="false" :to="editLink(row.id)">{{ row.orderNumber }}</UButton></template>
      <template #clientName-data="{ row }"><div>{{ row.clientName }}</div><div class="text-xs text-gray-500">{{ row.clientPhone }}</div></template>
      <template #status-data="{ row }"><UBadge variant="subtle" :color="statusColor(row.status)">{{ row.status }}</UBadge></template>
      <template #total-data="{ row }">{{ money(row.total) }}</template><template #invoiced-data="{ row }">{{ row.invoiced ? 'Yes' : 'No' }}</template>
      <template #actions-data="{ row }"><UDropdown :items="actions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" aria-label="Sales order actions" /></UDropdown></template>
    </DocumentTable>
    <Preferences v-model="preferencesOpen" document-kind="sales-order" @saved="refresh()" />
    <PrintPreview v-if="printing" :quote="printing" :company="scope.auth.session.value" document-title="SALES ORDER" @close="printing = null" />
    <UModal :model-value="!!deleting" @update:model-value="value => { if (!value && !busy) deleting = null }"><UCard><template #header><h3>Delete {{ deleting?.orderNumber }}?</h3></template><p class="text-sm text-gray-500">Remove this sales order from the saved list. Orders with linked invoices cannot be deleted.</p><template #footer><div class="flex justify-end gap-2"><UButton color="gray" :disabled="busy" @click="deleting = null">Cancel</UButton><UButton color="red" :loading="busy" @click="remove">Delete sales order</UButton></div></template></UCard></UModal>
  </UDashboardPanelContent>
</template>
