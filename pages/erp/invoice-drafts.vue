<script setup lang="ts">
import ErpDocumentTable from '~/components/Erp/DocumentTable.vue'
import { documentListDefaults, type DocumentListState } from '~/utils/erp-document-table'
import { billingErrorMessage } from '~/utils/billing-error'
definePageMeta({ auth: true })
useHead({ title: 'Invoice drafts · ERP' })
const scope = useCompanyScope('form', true)
await scope.ready
const toast = useToast(), table = ref(documentListDefaults('quoteDate')), busy = ref(''), printQuote = ref<any>(null), issuing = ref<any>(null)
const loadRows = (query: DocumentListState) => scope.fetch<any>('/api/quotes', { query: { ...query, drafts: '1' } })
const { data, pending, error, refresh } = await useAsyncData(`quote-invoice-drafts:${scope.companyId.value}`, () => loadRows(table.value), { watch: [table], default: () => ({ rows: [], total: 0 }) })
const columns = [{ key: 'quoteNumber', label: 'Source quote', sortable: true }, { key: 'quoteDate', label: 'Date', sortable: true }, { key: 'clientName', label: 'Customer', sortable: true }, { key: 'total', label: 'Total', sortable: true }, { key: 'actions', label: '' }]
const money = (value: any) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: scope.auth.session.value?.currency || 'INR' }).format(Number(value || 0))
const exportValue = (row: any, key: string) => key === 'total' ? Number(row.total) : String(row[key] || '')
async function preview(row: any) {
  const quote = await scope.fetch<any>(`/api/quotes/${row.id}`)
  printQuote.value = { ...quote.workflow.invoiceDraft.quote, documentDesign: quote.documentDesign }
}
async function issue() {
  if (!issuing.value || busy.value) return
  const row = issuing.value; busy.value = row.id
  try {
    const result = await scope.fetch<any>(`/api/quotes/${row.id}/workflow`, { method: 'POST', body: { action: 'issue' } })
    if (!result.success) throw Error(result.workflow.conversionError)
    issuing.value = null; toast.add({ title: `Invoice ${result.workflow.invoiceNumber} issued`, color: 'green' }); await refresh()
  } catch (e) { toast.add({ title: 'Invoice not issued', description: billingErrorMessage(e), color: 'red' }) }
  finally { busy.value = '' }
}
</script>
<template>
  <UDashboardPanelContent class="pb-8"><CompanyFormField toolbar :locked="!!busy" />
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-xl font-semibold">Invoice drafts</h1><p class="mt-1 text-sm text-gray-500">Accepted quotes awaiting invoice issue. Stock and accounts update when issued.</p></div><UButton color="gray" to="/erp/invoices">Invoices</UButton></div>
    <UAlert v-if="error" color="red" title="Could not load invoice drafts" :description="billingErrorMessage(error)" class="mb-4" />
    <ErpDocumentTable v-model="table" title="Invoice drafts" storage-key="erp-quote-invoice-draft-columns" :rows="data.rows" :total="data.total" :columns="columns" :loading="pending" filter-key="status" :filter-options="[{ label: 'All drafts', value: '' }]" :load-rows="loadRows" :export-value="exportValue" @refresh="refresh()">
      <template #total-data="{ row }">{{ money(row.total) }}</template>
      <template #actions-data="{ row }"><div class="flex gap-2"><UButton size="xs" color="gray" @click="preview(row)">Review draft</UButton><UButton size="xs" :disabled="!!busy" @click="issuing = row">Issue invoice</UButton></div></template>
    </ErpDocumentTable>
    <QuotesPrintPreview v-if="printQuote" :quote="printQuote" :company="scope.auth.session.value" document-title="INVOICE DRAFT" @close="printQuote = null" />
    <UModal :model-value="!!issuing" @update:model-value="value => { if (!value && !busy) issuing = null }"><UCard><template #header><h3 class="font-semibold">Issue invoice from {{ issuing?.quoteNumber }}?</h3></template><p class="text-sm">Create an unpaid invoice for {{ issuing?.clientName }} totaling {{ money(issuing?.total) }}. This records the sale and updates stock and accounts.</p><template #footer><div class="flex justify-end gap-2"><UButton color="gray" :disabled="!!busy" @click="issuing = null">Cancel</UButton><UButton :loading="!!busy" @click="issue">Confirm issue</UButton></div></template></UCard></UModal>
  </UDashboardPanelContent>
</template>
