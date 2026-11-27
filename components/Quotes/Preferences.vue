<script setup lang="ts">
import { emptyQuotePreferences, normalizeQuotePreferences, type QuotePreferences } from '~/utils/quote-preferences'
import { documentDesignDraftKey, useDocumentDesignDraft } from '~/composables/useDocumentDesignDraft'
import { billingErrorMessage } from '~/utils/billing-error'
const props = defineProps<{ modelValue: boolean; documentKind?: 'quote' | 'sales-order' }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const isSalesOrder = props.documentKind === 'sales-order'
const documentTitle = isSalesOrder ? 'Sales order' : 'Quote', documentName = isSalesOrder ? 'sales order' : 'quote'
const preferencesPath = isSalesOrder ? '/api/sales-orders/preferences' : '/api/quotes/preferences'
const scope = useCompanyScope()
const route = useRoute(), designDrafts = useDocumentDesignDraft()
const draftKey = computed(() => documentDesignDraftKey(scope.companyId.value, isSalesOrder ? 'sales-order' : 'quote'))
const toast = useToast()
const open = computed({ get: () => props.modelValue, set: value => {
  if (saving.value) return
  if (!value) delete designDrafts.value[draftKey.value]
  emit('update:modelValue', value)
} })
const draft = ref<QuotePreferences>(emptyQuotePreferences())
const savedDesign = ref('')
const loading = ref(false), saving = ref(false), error = ref(''), canManage = ref(false)
let version = 0
async function load() {
  const request = ++version; loading.value = true; error.value = ''; canManage.value = false
  try {
    const result = await scope.fetch<any>(preferencesPath)
    if (request === version) {
      draft.value = normalizeQuotePreferences(designDrafts.value[draftKey.value]?.preferences || result.preferences)
      delete designDrafts.value[draftKey.value]
      canManage.value = result.canManage
      savedDesign.value = JSON.stringify(normalizeQuotePreferences(result.preferences).documentDesign)
    }
  } catch (e) { if (request === version) error.value = billingErrorMessage(e) }
  finally { if (request === version) loading.value = false }
}
watch(() => props.modelValue, value => { if (value) void load(); else version++ })
onBeforeUnmount(() => { version++ })
async function openDesign() {
  if (saving.value || loading.value || !canManage.value) return
  designDrafts.value[draftKey.value] = { preferences: JSON.parse(JSON.stringify(draft.value)), savedDesign: savedDesign.value, returnTo: route.fullPath }
  await navigateTo({ path: isSalesOrder ? '/erp/sales-orders/design' : '/erp/quotes/design', query: { entryCompany: scope.companyId.value } })
}
async function save() {
  if (saving.value || loading.value || !canManage.value) return
  error.value = ''; saving.value = true
  try {
    const value = normalizeQuotePreferences(draft.value)
    await scope.fetch(preferencesPath, { method: 'PUT', body: value })
    savedDesign.value = JSON.stringify(value.documentDesign)
    delete designDrafts.value[draftKey.value]
    emit('saved'); emit('update:modelValue', false)
    toast.add({ title: `${documentTitle} preferences saved`, color: 'green' })
  } catch (e) { error.value = billingErrorMessage(e) }
  finally { saving.value = false }
}
</script>

<template>
  <USlideover v-model="open" side="right" :ui="{ width: 'max-w-2xl' }" :prevent-close="saving">
    <form class="flex h-full flex-col" :aria-label="`${documentTitle} preferences`" @submit.prevent="save">
      <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-5 dark:border-gray-800">
        <div><h2 class="text-lg font-semibold">{{ documentTitle }} preferences</h2><p class="mt-1 text-sm text-gray-500">Defaults for {{ documentName }} documents in this company.</p></div>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" aria-label="Close quote preferences" :disabled="saving" @click="open = false" />
      </div>
      <div class="flex-1 space-y-6 overflow-y-auto p-6">
        <p v-if="loading" class="text-sm text-gray-500">Loading preferences…</p>
        <UAlert v-if="error" color="red" title="Could not save or load preferences" :description="error" />
        <UButton v-if="error && !canManage" color="gray" @click="load">Retry</UButton>
        <p v-if="!loading && !error && !canManage" class="text-sm text-gray-500">Administrators, managers and accountants can change these preferences.</p>
        <fieldset v-if="!loading && !error || canManage" :disabled="saving || !canManage" class="space-y-6">
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"><h3 class="font-medium">{{ documentTitle }} design</h3><p class="mb-3 mt-1 text-sm text-gray-500">Customize your {{ documentName }} in the full-page print designer.</p><UButton color="gray" icon="i-heroicons-paint-brush" @click="openDesign">Design {{ documentName }}</UButton></div>
          <div class="space-y-5 border-t border-gray-200 pt-5 dark:border-gray-800">
            <UCheckbox v-model="draft.allowAcceptedEdits" :label="isSalesOrder ? 'Allow editing of closed or cancelled sales orders' : 'Allow editing of accepted quotes'" aria-label="Allow editing accepted quotes" />
            <UCheckbox v-if="!isSalesOrder" v-model="draft.allowCustomerApproval" label="Allow customers to accept or decline quotes through a public link or WhatsApp" aria-label="Allow customer quote approval" />
          </div>
          <UFormGroup v-if="!isSalesOrder" label="Automate accepted quotes to invoices conversion"><div class="mt-2 space-y-3 text-sm">
            <label class="flex items-start gap-2"><input v-model="draft.conversion" type="radio" name="conversion" value="none" class="mt-1 accent-orange-500" />Don't convert accepted quotes automatically</label>
            <label class="flex items-start gap-2"><input v-model="draft.conversion" type="radio" name="conversion" value="draft" aria-label="Convert accepted quotes to draft invoices" class="mt-1 accent-orange-500" /><span>Convert accepted quotes to draft invoices<small class="block text-gray-500">Save for review under Invoice drafts.</small></span></label>
            <label class="flex items-start gap-2"><input v-model="draft.conversion" type="radio" name="conversion" value="email" aria-label="Convert accepted quotes and email invoices" class="mt-1 accent-orange-500" /><span>Convert accepted quotes to invoices and email them to the customer</span></label>
          </div></UFormGroup>
          <UFormGroup v-if="!isSalesOrder && draft.conversion !== 'none'" label="Invoice due in (days)"><UInput v-model.number="draft.invoiceDueDays" type="number" min="0" max="365" aria-label="Invoice due days" /><p class="mt-1 text-xs text-gray-500">Calculated from the invoice issue date.</p></UFormGroup>
          <div v-if="!isSalesOrder" class="space-y-3 border-t border-gray-200 pt-5 text-sm dark:border-gray-800">
            <p>Select the fields in a quote that you'd like to retain when you convert it to a sales order or invoice.</p>
            <UCheckbox v-model="draft.retainCustomerNotes" label="Customer Notes" aria-label="Retain customer notes on conversion" />
            <UCheckbox v-model="draft.retainTermsAndConditions" label="Terms & Conditions" aria-label="Retain terms and conditions on conversion" />
          </div>
          <div class="border-t border-gray-200 pt-5 dark:border-gray-800"><h3 class="mb-3 font-medium">Zero-value line items</h3><UCheckbox v-model="draft.hideZeroValueItems" label="Hide zero-value line items" aria-label="Hide zero-value quote items" /><p class="mt-2 text-xs text-gray-500">Hide these lines on printed documents. They remain visible while editing. Documents with a zero total still show all items.</p></div>
          <UFormGroup label="Terms & Conditions"><UTextarea v-model="draft.termsAndConditions" :rows="6" maxlength="10000" :aria-label="`Default ${documentName} terms`" /></UFormGroup>
          <UFormGroup label="Customer Notes"><UTextarea v-model="draft.customerNotes" :rows="5" maxlength="5000" :aria-label="`Default ${documentName} notes`" /></UFormGroup>
          <p class="text-xs text-gray-500">Notes and item visibility defaults apply to new documents. The company design and workflow policies apply to saved documents too.</p>
        </fieldset>
      </div>
      <div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800"><UButton color="gray" :disabled="saving" @click="open = false">Cancel</UButton><UButton type="submit" :loading="saving" :disabled="loading || !canManage">Save preferences</UButton></div>
    </form>
  </USlideover>
</template>
