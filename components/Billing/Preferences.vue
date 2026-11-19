<script setup lang="ts">
import { emptyBillingPreferences, normalizeBillingPreferences, billingPageSizes, type BillingDocumentKind } from '~/utils/billing-preferences'
import { billingErrorMessage } from '~/utils/billing-error'
import type { InvoicePaymentTerm } from '~/utils/invoice-payment-terms'
const props = defineProps<{ modelValue: boolean; document: BillingDocumentKind; companyId: string; companyName?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const scope = useCompanyScope(), toast = useToast()
const title = computed(() => props.document === 'invoice' ? 'Invoice' : 'Sales')
const draft = ref(emptyBillingPreferences(props.document)), terms = ref<InvoicePaymentTerm[]>([])
const loading = ref(false), saving = ref(false), error = ref(''), canManage = ref(false)
const open = computed({ get: () => props.modelValue, set: value => { if (!saving.value) emit('update:modelValue', value) } })
let version = 0
async function load() {
  const request = ++version; loading.value = true; error.value = ''; canManage.value = false
  try {
    const result = await scope.fetch<any>('/api/settings/billing-preferences', { query: { document: props.document }, headers: { 'x-company-id': props.companyId } })
    if (request === version) { draft.value = normalizeBillingPreferences(result.preferences, props.document); terms.value = result.terms; canManage.value = result.canManage }
  } catch (e) { if (request === version) error.value = billingErrorMessage(e) }
  finally { if (request === version) loading.value = false }
}
watch(() => [props.modelValue, props.companyId, props.document], () => { if (props.modelValue) void load(); else version++ }, { immediate: true })
onBeforeUnmount(() => { version++ })
async function save() {
  if (saving.value || loading.value || !canManage.value) return
  saving.value = true; error.value = ''
  const request = version
  try {
    const value = normalizeBillingPreferences(draft.value, props.document)
    await scope.fetch('/api/settings/billing-preferences', { method: 'PUT', query: { document: props.document }, headers: { 'x-company-id': props.companyId }, body: value })
    if (request !== version) return
    emit('saved'); emit('update:modelValue', false)
    toast.add({ title: `${title.value} preferences saved`, color: 'green' })
  } catch (e) { if (request === version) error.value = billingErrorMessage(e) }
  finally { saving.value = false }
}
</script>
<template>
  <USlideover v-model="open" side="right" :ui="{ width: 'max-w-2xl' }" :prevent-close="saving">
    <form class="flex h-full flex-col" :aria-label="`${title} preferences`" @submit.prevent="save">
      <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-5 dark:border-gray-800">
        <div><h2 class="text-lg font-semibold">{{ title }} preferences</h2><p class="mt-1 text-sm text-gray-500">Defaults for {{ document === 'invoice' ? 'invoices' : 'Pay now sales' }} in {{ companyName || 'this company' }}.</p></div>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" :aria-label="`Close ${title.toLowerCase()} preferences`" :disabled="saving" @click="open = false" />
      </div>
      <div class="flex-1 space-y-6 overflow-y-auto p-6">
        <p v-if="loading" class="text-sm text-gray-500">Loading preferences…</p>
        <UAlert v-if="error" color="red" title="Could not load or save preferences" :description="error" />
        <UButton v-if="error && !canManage" color="gray" @click="load">Retry</UButton>
        <p v-if="!loading && !error && !canManage" class="text-sm text-gray-500">Administrators, managers and accountants can change these preferences.</p>
        <fieldset v-if="!loading && !error || canManage" :disabled="saving || !canManage" class="space-y-6">
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"><h3 class="font-medium">Receipt design</h3><p class="mb-3 mt-1 text-sm text-gray-500">Manage the company receipt layout, paper size and printer settings used by sales and invoices.</p><UButton color="gray" icon="i-heroicons-paint-brush" :to="{ path: '/settings/printer', query: { entryCompany: companyId } }" target="_blank">Manage receipt design</UButton></div>
          <UFormGroup v-if="document === 'invoice'" label="Default payment terms"><USelect v-model="draft.paymentTermId" :options="terms" option-attribute="name" value-attribute="id" aria-label="Default invoice payment terms" /><p class="mt-1 text-xs text-gray-500">Calculates the due date from the invoice date for new invoice drafts.</p></UFormGroup>
          <UFormGroup label="Customer Notes"><UTextarea v-model="draft.customerNotes" :rows="5" maxlength="5000" :aria-label="`Default ${document} customer notes`" /></UFormGroup>
          <UFormGroup label="Terms & Conditions"><UTextarea v-model="draft.termsAndConditions" :rows="6" maxlength="10000" :aria-label="`Default ${document} terms and conditions`" /></UFormGroup>
          <p class="text-xs text-gray-500">Document defaults apply to new and reset drafts. Existing drafts and issued documents keep their own values.</p>
          <div class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800"><h3 class="font-medium">Table display</h3><UFormGroup label="Rows per page when opening this table"><USelect :model-value="draft.pageSize" :options="billingPageSizes" aria-label="Default table rows per page" @update:model-value="draft.pageSize = Number($event)" /></UFormGroup><UCheckbox v-model="draft.showSummary" label="Show summary cards" aria-label="Show table summary cards" /></div>
        </fieldset>
      </div>
      <div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800"><UButton color="gray" :disabled="saving" @click="open = false">Cancel</UButton><UButton type="submit" :loading="saving" :disabled="loading || !canManage">Save preferences</UButton></div>
    </form>
  </USlideover>
</template>
