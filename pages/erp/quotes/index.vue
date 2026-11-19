<script setup lang="ts">
import ErpDocumentTable from '~/components/Erp/DocumentTable.vue'
import { documentListDefaults, type DocumentListState } from '~/utils/erp-document-table'
import { quoteStatuses } from '~/utils/erp-quote'
import { billingErrorMessage } from '~/utils/billing-error'
import QuotePreferences from '~/components/Quotes/Preferences.vue'

definePageMeta({ auth: true })
useHead({ title: 'Quotes · ERP' })
// Quotes are numbered and owned by one company; retain the existing company selector.
const scope = useCompanyScope('form', true)
await scope.ready
const toast = useToast()
const session = computed(() => scope.auth.session.value as any)
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: session.value?.currency || 'INR' }).format(value || 0)
const busy = ref(false)
const printQuote = ref<any>(null)
const deleting = ref<any>(null)
const preferencesOpen = ref(false)
const shareOpen = ref(false), shareUrl = ref(''), sharePhone = ref(''), shareNumber = ref('')
const whatsappUrl = computed(() => {
  const digits = sharePhone.value.replace(/\D/g, '')
  const phone = digits.length === 10 ? '91' + digits : digits
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Quote ${shareNumber.value}: ${shareUrl.value}`)}`
})
const addQuoteTo = computed(() => ({ path: '/erp/quotes/add', query: { entryCompany: scope.companyId.value } }))
const editQuoteTo = (id: string) => ({ path: `/erp/quotes/edit/${encodeURIComponent(id)}`, query: { entryCompany: scope.companyId.value } })
const table = ref(documentListDefaults('quoteDate'))
const columns = [
  { key: 'quoteNumber', label: 'Quote', sortable: true }, { key: 'quoteDate', label: 'Date', sortable: true },
  { key: 'clientName', label: 'Customer', sortable: true }, { key: 'expiryDate', label: 'Valid until', sortable: true },
  { key: 'status', label: 'Status', sortable: true }, { key: 'total', label: 'Total', sortable: true },
  { key: 'workflow', label: 'Invoice workflow' }, { key: 'actions', label: '' },
]
const loadRows = computed(() => {
  const companyId = scope.companyId.value
  return (query: DocumentListState) => scope.fetch<any>('/api/quotes', { query, headers: { 'x-company-id': companyId, 'x-company-filter': companyId } })
})
const { data: quotes, pending: listLoading, error: listError, refresh } = await useAsyncData(
  `erp-quotes:${scope.companyId.value}`,
  () => loadRows.value(table.value),
  { watch: [table, scope.companyId], default: () => ({ rows: [], total: 0, summary: {} }) },
)
watch(scope.companyId, () => { table.value = { ...table.value, page: 1 } })
const quoteCards = computed(() => [
  { label: 'Total quotes', value: money(quotes.value?.summary?.amount), icon: 'i-heroicons-document-duplicate', filter: '' },
  { label: 'Draft', value: money(quotes.value?.summary?.draft), icon: 'i-heroicons-pencil-square', filter: 'DRAFT' },
  { label: 'Sent', value: money(quotes.value?.summary?.sent), icon: 'i-heroicons-paper-airplane', filter: 'SENT' },
  { label: 'Accepted', value: money(quotes.value?.summary?.accepted), icon: 'i-heroicons-check-circle', filter: 'ACCEPTED' },
  { label: 'Declined', value: money(quotes.value?.summary?.declined), icon: 'i-heroicons-x-circle', filter: 'DECLINED' },
])
const exportValue = (row: any, key: string) => key === 'total' ? Number(row[key] || 0) : key === 'workflow' ? [row.workflow?.invoiceId ? `Invoice ${row.workflow.invoiceNumber}` : row.workflow?.invoiceDraft ? 'Invoice draft' : '', row.workflow?.emailStatus, row.workflow?.conversionError, row.workflow?.emailError].filter(Boolean).join(' · ') : row[key] || ''
const quoteActions = (row: any) => [[
  { label: 'Edit quote', icon: 'i-heroicons-pencil-square', disabled: busy.value, to: editQuoteTo(row.id) },
  { label: 'Print quote', icon: 'i-heroicons-printer', disabled: busy.value, click: () => preview(row.id) },
  { label: 'Share quote', icon: 'i-heroicons-share', disabled: busy.value, click: () => share(row) },
  ...(row.workflow?.invoiceDraft ? [{ label: 'Review invoice draft', to: { path: '/erp/invoice-drafts', query: { entryCompany: scope.companyId.value } } }] : []),
  ...(row.workflow?.conversionError ? [{ label: 'Retry invoice conversion', disabled: busy.value, click: () => workflowAction(row, 'retry') }] : []),
  ...(row.workflow?.invoiceId && ['Failed', 'Pending'].includes(row.workflow?.emailStatus) ? [{ label: 'Retry invoice email', disabled: busy.value, click: () => workflowAction(row, 'email') }] : []),
  { label: 'Delete quote', icon: 'i-heroicons-trash', disabled: busy.value, click: () => { deleting.value = row } },
]]
async function share(row: any) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await scope.fetch<any>(`/api/quotes/${row.id}/share`, { method: 'POST' })
    shareUrl.value = window.location.origin + result.path; sharePhone.value = result.phone || ''; shareNumber.value = result.quoteNumber; shareOpen.value = true
  } catch (e) { toast.add({ title: 'Could not share quote', description: billingErrorMessage(e), color: 'red' }) }
  finally { busy.value = false }
}
async function copyShare() {
  try { await navigator.clipboard.writeText(shareUrl.value); toast.add({ title: 'Quote link copied', color: 'green' }) }
  catch { toast.add({ title: 'Select and copy the link below', color: 'orange' }) }
}
async function workflowAction(row: any, action: string) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await scope.fetch<any>(`/api/quotes/${row.id}/workflow`, { method: 'POST', body: { action } })
    if (!result.success) throw Error(result.workflow.conversionError || result.workflow.emailError)
    toast.add({ title: 'Quote workflow updated', color: 'green' })
  } catch (e) { toast.add({ title: 'Quote action failed', description: billingErrorMessage(e), color: 'red' }) }
  finally { busy.value = false; await refresh() }
}
async function preview(id: string) {
  busy.value = true
  try { printQuote.value = await scope.fetch<any>(`/api/quotes/${encodeURIComponent(id)}`) }
  catch (error) { toast.add({ title: 'Could not load quote preview', description: billingErrorMessage(error), color: 'red' }) }
  finally { busy.value = false }
}
async function removeQuote() {
  if (!deleting.value || busy.value) return
  busy.value = true
  try {
    await scope.fetch(`/api/quotes/${encodeURIComponent(deleting.value.id)}`, { method: 'DELETE' })
    deleting.value = null
    await refresh(); toast.add({ title: 'Quote deleted', color: 'green' })
  } catch (error) { toast.add({ title: 'Could not delete quote', description: billingErrorMessage(error), color: 'red' }) }
  finally { busy.value = false }
}
const statusColor = (status: string) => ({ DRAFT: 'gray', SENT: 'blue', ACCEPTED: 'green', DECLINED: 'red', EXPIRED: 'orange' }[status] as any)
</script>

<template>
  <UDashboardPanelContent class="pb-8">
    <CompanyFormField toolbar :locked="busy" />
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-xl font-semibold">Quotes</h1><p class="mt-1 text-sm text-gray-500">Find, edit and print your customer quotes.</p></div>
      <div class="flex gap-2"><UButton color="gray" icon="i-heroicons-adjustments-horizontal" @click="preferencesOpen = true">Preference</UButton><UButton :to="addQuoteTo" icon="i-heroicons-plus" :disabled="busy">Add quote</UButton></div>
    </div>
      <UAlert v-if="listError" color="red" title="Could not load quotes" :description="billingErrorMessage(listError)" class="mb-4" />
      <ErpDocumentTable v-model="table" title="Quotes" :storage-key="`erp-quotes-columns:${scope.companyId.value}`" :rows="quotes?.rows || []" :total="quotes?.total || 0" :columns="columns" :loading="listLoading" :cards="quoteCards" filter-key="status" :filter-options="[{ label: 'All statuses', value: '' }, ...quoteStatuses.map(value => ({ label: value, value }))]" :load-rows="loadRows" :export-value="exportValue" @refresh="refresh()">
        <template #quoteNumber-data="{ row }"><UButton variant="link" :padded="false" :disabled="busy" :to="editQuoteTo(row.id)">{{ row.quoteNumber }}</UButton></template>
        <template #clientName-data="{ row }"><div>{{ row.clientName || '—' }}</div><div class="text-xs text-gray-500">{{ row.clientPhone }}</div></template>
        <template #expiryDate-data="{ row }">{{ row.expiryDate || '—' }}</template>
        <template #status-data="{ row }"><UBadge variant="subtle" :color="statusColor(row.status)">{{ row.status }}</UBadge></template>
        <template #total-data="{ row }">{{ money(row.total) }}</template>
        <template #workflow-data="{ row }"><div class="max-w-64 text-xs">
          <UButton v-if="row.workflow?.invoiceId" variant="link" :padded="false" :to="`/receipt/${row.workflow.invoiceId}?companyId=${scope.companyId.value}`">Invoice {{ row.workflow.invoiceNumber }}</UButton>
          <UButton v-else-if="row.workflow?.invoiceDraft" variant="link" :padded="false" :to="{ path: '/erp/invoice-drafts', query: { entryCompany: scope.companyId.value } }">Invoice draft</UButton>
          <p v-if="row.workflow?.emailStatus">Email: {{ row.workflow.emailStatus }}</p><p v-if="row.workflow?.conversionError || row.workflow?.emailError" class="text-red-500">{{ row.workflow.conversionError || row.workflow.emailError }}</p>
        </div></template>
        <template #actions-data="{ row }">
          <UDropdown :items="quoteActions(row)"><UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" aria-label="Quote actions" /></UDropdown>
        </template>
      </ErpDocumentTable>
    <UModal :model-value="!!deleting" @update:model-value="value => { if (!value && !busy) deleting = null }">
      <UCard><template #header><h3 class="font-semibold">Delete {{ deleting?.quoteNumber }}?</h3></template>
        <p class="text-sm text-gray-500">This quote will be removed from your saved quotes.</p>
        <template #footer><div class="flex justify-end gap-2"><UButton color="gray" :disabled="busy" @click="deleting = null">Cancel</UButton><UButton color="red" :loading="busy" @click="removeQuote">Delete quote</UButton></div></template>
      </UCard>
    </UModal>
    <QuotesPrintPreview v-if="printQuote" :quote="printQuote" :company="session" @close="printQuote = null" />
    <QuotePreferences v-model="preferencesOpen" @saved="refresh()" />
    <UModal v-model="shareOpen"><UCard><template #header><h3 class="font-semibold">Share {{ shareNumber }}</h3></template><p class="mb-3 text-sm text-gray-500">Share this link with your customer. Customer acceptance and decline follow your quote preferences. Links expire in 30 days; editing the quote requires a new link.</p><UInput :model-value="shareUrl" readonly aria-label="Quote customer link" @focus="($event.target as HTMLInputElement).select()" /><div class="mt-4 flex flex-wrap gap-2"><UButton color="gray" @click="copyShare">Copy link</UButton><UButton v-if="sharePhone" :to="whatsappUrl" target="_blank" external>Open WhatsApp</UButton><UButton color="gray" @click="shareOpen = false">Close</UButton></div></UCard></UModal>
  </UDashboardPanelContent>
</template>
