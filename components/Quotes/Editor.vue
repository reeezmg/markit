<script setup lang="ts">
import { v4 as uuid } from 'uuid'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { newQuoteLine, normalizeQuote, quoteLineAmount, quoteMoney, quoteStatuses, quoteTotals, type QuoteInput, type QuoteLine } from '~/utils/erp-quote'
import { billingErrorMessage } from '~/utils/billing-error'
import { quoteProductSearchFields, quoteProductSearchStorageKey, isQuoteProductSearchField, type QuoteProductSearchField } from '~/utils/quote-product-search'
import { emptyQuotePreferences } from '~/utils/quote-preferences'
import { salesOrderStatuses, salesOrderForEditor, salesOrderFromEditor } from '~/utils/sales-order'
import { quoteLocalKey, readQuoteLocalDraft, type QuoteLocalDraft } from '~/utils/quote-draft'

const props = defineProps<{ savedQuoteId?: string; documentKind?: 'quote' | 'sales-order' }>()
const isSalesOrder = props.documentKind === 'sales-order'
const documentName = isSalesOrder ? 'sales order' : 'quote', documentTitle = isSalesOrder ? 'Sales order' : 'Quote'
const documentPlural = isSalesOrder ? 'sales orders' : 'quotes'
const apiPath = isSalesOrder ? '/api/sales-orders' : '/api/quotes', pagePath = isSalesOrder ? '/erp/sales-orders' : '/erp/quotes'
const statusChoices: readonly string[] = isSalesOrder ? salesOrderStatuses : quoteStatuses
const readDocument = async (id: string) => { const value = await scope.fetch<any>(`${apiPath}/${encodeURIComponent(id)}`); return isSalesOrder ? salesOrderForEditor(value) : value }
const router = useRouter()
const scope = useCompanyScope('form', true)
await scope.ready
const toast = useToast()
const session = computed(() => scope.auth.session.value as any)
const { data: preferenceData, error: preferenceError, refresh: refreshPreferences } = await useAsyncData(`erp-${documentName}-preferences:${scope.companyId.value}`,
  () => scope.fetch<any>(`${apiPath}/preferences`), { default: () => ({ preferences: emptyQuotePreferences() }) })
const preferences = computed(() => preferenceData.value?.preferences || emptyQuotePreferences())
const persistedStatus = ref('')
const workflow = ref<any>({})
const canEdit = computed(() => !(isSalesOrder ? ['CLOSED', 'CANCELLED'].includes(persistedStatus.value) : persistedStatus.value === 'ACCEPTED') || preferences.value.allowAcceptedEdits)
const currency = computed(() => session.value?.currency || 'INR')
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.value }).format(value || 0)
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const rememberedStatus = ref<QuoteInput['status']>('DRAFT')
const blank = (): QuoteInput => ({ clientId: '', quoteDate: today(), expiryDate: '', referenceNumber: '', subject: '',
  salesperson: '', status: rememberedStatus.value, notes: preferences.value.customerNotes, termsAndConditions: preferences.value.termsAndConditions, paymentTerms: '', deliveryEstimate: '',
  pdfTemplate: 'classic', hideZeroValueItems: preferences.value.hideZeroValueItems,
  discount: 0, discountType: 'amount', adjustment: 0, items: [newQuoteLine(uuid())] })
const form = ref(blank())
const quoteId = ref('')
const quoteNumber = ref('')
const revision = ref('')
const baseline = ref(JSON.stringify(form.value))
const dirty = computed(() => JSON.stringify(form.value) !== baseline.value)
const busy = ref(false)
const saving = ref(false)
const formError = ref('')
const totals = computed(() => quoteTotals(form.value))
const requestId = ref(uuid())
watch(form, () => { requestId.value = uuid(); formError.value = '' }, { deep: true, flush: 'sync' })
const customerSearch = ref('')
const customer = ref<{ id: string; name: string; phone: string } | null>(null)
const customerMatches = ref<any[]>([])
const customerLoading = ref(false)
const customerError = ref('')
type StaffOption = { id: string; name?: string; email: string; code?: string | number }
const staffSearch = ref('')
const staffMatches = ref<StaffOption[]>([])
const staffLoading = ref(false)
const staffError = ref('')
const showAddClient = ref(false)
const addClientPhone = ref('')
const productSearch = ref('')
const productSearchField = ref<QuoteProductSearchField>('all')
const productSearchPlaceholder = computed(() => productSearchField.value === 'all' ? 'Search products across all fields' : `Search by ${quoteProductSearchFields.find(field => field.value === productSearchField.value)!.label.toLowerCase()}`)
let searchPreferenceReady = false
watch(productSearchField, value => {
  if (searchPreferenceReady) try { localStorage.setItem(quoteProductSearchStorageKey, value) } catch { /* Browser storage is optional. */ }
})
const products = ref<any[]>([])
const productLoading = ref(false)
const productError = ref('')
const printQuote = ref<any>(null)
const initialLoadError = ref('')
const quotesTo = computed(() => ({ path: pagePath, query: { entryCompany: scope.companyId.value } }))
const addQuoteTo = computed(() => ({ path: `${pagePath}/add`, query: { entryCompany: scope.companyId.value } }))
let localDraftReady = false, restoringDraft = false
const localDraftError = ref('')
const draftCompanyId = scope.companyId.value, draftUserId = session.value?.id || ''
const localKey = (kind: 'draft' | 'status') => quoteLocalKey(kind, draftCompanyId, draftUserId, isSalesOrder ? 'sales-order' : 'quote')
const isNewQuote = () => !props.savedQuoteId && !quoteId.value
function persistDraft() {
  if (!localDraftReady || restoringDraft || !isNewQuote()) return false
  try {
    if (!dirty.value && !customerSearch.value && !staffSearch.value && !productSearch.value) localStorage.removeItem(localKey('draft'))
    else {
      const draft: QuoteLocalDraft = { version: 1, requestId: requestId.value, form: form.value, customer: customer.value,
        customerSearch: customerSearch.value, staffSearch: staffSearch.value, productSearch: productSearch.value }
      const serialized = JSON.stringify(draft)
      if (serialized.length > 1000000 || form.value.items.length > 500) throw Error('Draft is too large')
      localStorage.setItem(localKey('draft'), serialized)
    }
    localDraftError.value = ''; return true
  } catch { localDraftError.value = 'Your browser could not store this draft. Keep this page open until you save the quote.'; return false }
}
watch([form, customer, customerSearch, staffSearch, productSearch], persistDraft, { deep: true, flush: 'sync' })
watch(() => form.value.status, status => {
  if (!localDraftReady || !isNewQuote() || !statusChoices.includes(status)) return
  rememberedStatus.value = status
  try { localStorage.setItem(localKey('status'), status) } catch { /* Draft persistence reports unavailable storage. */ }
}, { flush: 'sync' })
function discard() { return isNewQuote() && persistDraft() || !dirty.value || window.confirm(`Discard the unsaved ${documentName} changes?`) }
function newQuote() {
  if (props.savedQuoteId) void router.push(addQuoteTo.value)
  else reset()
}
function reset() {
  if (dirty.value && !window.confirm(`Clear this unfinished ${documentName}?`)) return
  restoringDraft = true
  form.value = blank(); quoteId.value = ''; quoteNumber.value = ''; revision.value = ''
  persistedStatus.value = ''
  workflow.value = {}
  customer.value = null; customerSearch.value = ''; customerMatches.value = []
  staffSearch.value = ''; staffMatches.value = []; staffError.value = ''
  productSearch.value = ''; products.value = []; formError.value = ''
  baseline.value = JSON.stringify(form.value)
  restoringDraft = false
  try { localStorage.removeItem(localKey('draft')) } catch { /* Navigation still warns when persistence is unavailable. */ }
}
function applyQuote(result: any) {
  quoteId.value = result.id; quoteNumber.value = result.quoteNumber; revision.value = result.revision
  persistedStatus.value = result.status
  workflow.value = result.workflow || {}
  const defaults = { ...blank(), notes: '', termsAndConditions: '', pdfTemplate: 'classic' as const, hideZeroValueItems: false }
  form.value = { ...defaults, ...Object.fromEntries(Object.keys(defaults).map(key => [key, result[key] ?? (defaults as any)[key]])),
    items: result.items.map((line: QuoteLine) => ({ ...line })) } as QuoteInput
  customer.value = { id: result.clientId, name: result.clientName || '', phone: result.clientPhone || '' }
  customerSearch.value = ''; customerMatches.value = []; productSearch.value = ''; products.value = []
  staffSearch.value = ''; staffMatches.value = []; staffError.value = ''
  baseline.value = JSON.stringify(form.value)
  initialLoadError.value = ''
}
async function loadQuote(id: string) {
  if (!discard()) return
  busy.value = true; formError.value = ''
  try { applyQuote(await readDocument(id)) }
  catch (error) {
    if (!quoteId.value) initialLoadError.value = billingErrorMessage(error)
    toast.add({ title: 'Could not open quote', description: billingErrorMessage(error), color: 'red' })
  }
  finally { busy.value = false }
}
function selectCustomer(match: any) {
  customer.value = { id: match.id, name: match.name || '', phone: String(match.phone || '') }; form.value.clientId = match.id; customerSearch.value = ''; customerMatches.value = []
}
function clientAdded(id: string, name: string, phone: string) { selectCustomer({ id, name, phone }); showAddClient.value = false }
const staffName = (user: StaffOption) => user.name || user.email
function selectStaff(user: StaffOption) {
  form.value.salesperson = staffName(user)
  staffSearch.value = ''; staffMatches.value = []; staffError.value = ''
}
let staffTimer: ReturnType<typeof setTimeout> | undefined
let staffToken = 0
let staffRequest: Promise<StaffOption[]> | undefined
function companyStaff() {
  if (!staffRequest) staffRequest = scope.fetch<StaffOption[]>('/api/getuser', { query: { companyId: scope.companyId.value } })
    .catch(error => {
      if (Number(error?.statusCode || error?.status || error?.response?.status) === 404) return []
      staffRequest = undefined
      throw error
    })
  return staffRequest
}
async function searchStaff() {
  const token = ++staffToken, search = staffSearch.value.trim().toLowerCase()
  staffMatches.value = []; staffError.value = ''; staffLoading.value = false
  if (!search) return
  staffLoading.value = true
  try {
    const users = await companyStaff()
    if (token === staffToken) staffMatches.value = users.filter(user =>
      [user.name, user.email, user.code].some(value => String(value ?? '').toLowerCase().includes(search)),
    ).slice(0, 8)
  } catch (error) { if (token === staffToken) staffError.value = billingErrorMessage(error, 'Could not search staff. Try again.') }
  finally { if (token === staffToken) staffLoading.value = false }
}
watch(staffSearch, () => {
  clearTimeout(staffTimer); staffToken++
  staffMatches.value = []; staffError.value = ''; staffLoading.value = false
  if (staffSearch.value.trim()) {
    staffLoading.value = true
    staffTimer = setTimeout(searchStaff, 250)
  }
})
let customerTimer: ReturnType<typeof setTimeout> | undefined
let customerToken = 0
watch(customerSearch, value => {
  clearTimeout(customerTimer)
  const token = ++customerToken
  customerMatches.value = []; customerError.value = ''; customerLoading.value = false
  if (!value.trim()) return
  customerLoading.value = true
  customerTimer = setTimeout(async () => {
    try {
      const result = await scope.fetch<any[]>('/api/bill/findManyClient', { query: { q: value } })
      if (token === customerToken) customerMatches.value = result
    } catch (error) { if (token === customerToken) customerError.value = billingErrorMessage(error, 'Could not search customers. Try again.') }
    finally { if (token === customerToken) customerLoading.value = false }
  }, 250)
})
let productTimer: ReturnType<typeof setTimeout> | undefined
let productToken = 0
watch([productSearch, productSearchField], ([value, field]) => {
  clearTimeout(productTimer)
  const token = ++productToken
  products.value = []; productError.value = ''; productLoading.value = false
  if (!value.trim()) return
  productLoading.value = true
  productTimer = setTimeout(async () => {
    try {
      const result = await scope.fetch<any[]>('/api/bill/searchItems', { query: { q: value, limit: 5, field } })
      if (token === productToken) products.value = result
    } catch (error) { if (token === productToken) productError.value = billingErrorMessage(error, 'Could not search products. Try again.') }
    finally { if (token === productToken) productLoading.value = false }
  }, 250)
})
function addProduct(product: any) {
  if (form.value.items.length >= 200) return
  const variant = product.variant
  const category = variant.product?.category
  const discountedRate = Number(variant.sprice || 0) * (1 - Number(variant.discount || 0) / 100)
  const tax = category?.taxType === 'FIXED' ? Number(category.fixedTax || 0)
    : category?.taxType === 'VARIABLE' ? Number(discountedRate > Number(category.thresholdAmount || 0) ? category.taxAboveThreshold || 0 : category.taxBelowThreshold || 0)
    : Number(variant.tax || 0)
  const line = { ...newQuoteLine(uuid()), variantId: variant.id,
    name: [variant.product?.name, variant.name].filter(Boolean).join(' · '), barcode: product.barcode || '',
    size: product.size || '', unit: variant.unit || '',
    rate: quoteMoney(Number(variant.sprice || 0) * (session.value?.isTaxIncluded === false ? 1 + tax / 100 : 1)),
    discount: Number(variant.discount || 0), tax }
  const empty = form.value.items.findIndex(item => !item.name.trim() && !item.variantId && !item.description.trim() && !Number(item.rate))
  if (empty >= 0) form.value.items.splice(empty, 1, line)
  else form.value.items.push(line)
  productSearch.value = ''; products.value = []
}
function removeLine(index: number) {
  form.value.items.splice(index, 1)
  if (!form.value.items.length) form.value.items.push(newQuoteLine(uuid()))
}
async function save(andPrint = false) {
  if (saving.value || busy.value || initialLoadError.value || preferenceError.value || !canEdit.value) return
  formError.value = ''
  if (staffSearch.value.trim() && !form.value.salesperson) {
    formError.value = 'Select a user from the Prepared by results or clear the search.'
    return
  }
  let input: QuoteInput
  try { input = { ...normalizeQuote({ ...form.value, status: isSalesOrder ? 'DRAFT' : form.value.status }), status: form.value.status } }
  catch (error: any) { formError.value = error.message; return }
  saving.value = true
  try {
    const saved = await scope.fetch<any>(quoteId.value ? `${apiPath}/${encodeURIComponent(quoteId.value)}` : apiPath, {
      method: quoteId.value ? 'PUT' : 'POST', body: { ...(isSalesOrder ? salesOrderFromEditor(input) : input), requestId: requestId.value, revision: revision.value },
    })
    quoteId.value = saved.id; quoteNumber.value = isSalesOrder ? saved.orderNumber : saved.quoteNumber; revision.value = saved.revision
    persistedStatus.value = form.value.status
    workflow.value = saved.workflow || {}
    try { if (!props.savedQuoteId) localStorage.removeItem(localKey('draft')) } catch { /* The saved quote remains available on the server. */ }
    baseline.value = JSON.stringify(form.value)
    requestId.value = uuid()
    toast.add({ title: `${quoteNumber.value} saved`, color: workflow.value.conversionError || workflow.value.emailError ? 'orange' : 'green' })
    if (andPrint) await preview(saved.id)
  } catch (error) { formError.value = billingErrorMessage(error, 'Could not save the quote. Your changes are still here; try again.') }
  finally { saving.value = false }
}
async function preview(id: string) {
  busy.value = true
  try { printQuote.value = await readDocument(id) }
  catch (error) { toast.add({ title: 'Could not load quote preview', description: billingErrorMessage(error), color: 'red' }) }
  finally { busy.value = false }
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value && !(isNewQuote() && persistDraft())) { event.preventDefault(); event.returnValue = '' } }
async function reloadQuotePreferences() {
  await refreshPreferences()
  if (!preferenceError.value && !quoteId.value && !props.savedQuoteId && !dirty.value) {
    form.value = blank(); baseline.value = JSON.stringify(form.value)
  }
}
onBeforeRouteLeave(() => !saving.value && discard())
onBeforeRouteUpdate(() => !saving.value && discard())
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  if (isNewQuote()) {
    restoringDraft = true
    try {
      const status = localStorage.getItem(localKey('status'))
      if (statusChoices.includes(status as any)) rememberedStatus.value = status as QuoteInput['status']
      form.value.status = rememberedStatus.value; baseline.value = JSON.stringify(form.value)
      const draft = readQuoteLocalDraft(localStorage.getItem(localKey('draft')), statusChoices)
      if (draft) {
        form.value = draft.form; requestId.value = draft.requestId; customer.value = draft.customer
        rememberedStatus.value = draft.form.status
        customerSearch.value = draft.customerSearch; staffSearch.value = draft.staffSearch; productSearch.value = draft.productSearch
      }
    } catch { /* Start with the normal defaults if browser storage cannot be read. */ }
    restoringDraft = false
  }
  localDraftReady = true
  try {
    const saved = localStorage.getItem(quoteProductSearchStorageKey)
    if (isQuoteProductSearchField(saved)) productSearchField.value = saved
  } catch { /* Default to all fields when storage is unavailable. */ }
  searchPreferenceReady = true
})
onBeforeUnmount(() => {
  persistDraft()
  window.removeEventListener('beforeunload', beforeUnload)
  clearTimeout(customerTimer); clearTimeout(productTimer); clearTimeout(staffTimer)
  customerToken++; productToken++; staffToken++
})
if (props.savedQuoteId) {
  const initial = await useAsyncData(`erp-${documentName}-editor:${scope.companyId.value}:${props.savedQuoteId}`,
    () => readDocument(props.savedQuoteId!))
  if (initial.error.value) initialLoadError.value = billingErrorMessage(initial.error.value)
  else applyQuote(initial.data.value)
}
</script>

<template>
  <UDashboardPanelContent class="pb-8">
    <CompanyFormField toolbar :locked="saving || busy || !!quoteId || !!savedQuoteId" />
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-xl font-semibold">{{ quoteNumber || (savedQuoteId ? 'Edit ' + documentName : 'New ' + documentName) }}</h1><p class="mt-1 text-sm text-gray-500">Prepare prices, validity and terms for your customer.</p></div>
      <div class="flex gap-2">
        <UButton color="gray" icon="i-heroicons-arrow-left" :to="quotesTo" :disabled="saving || busy">Back to {{ documentPlural }}</UButton>
        <UButton v-if="quoteId || savedQuoteId" icon="i-heroicons-plus" :disabled="saving || busy" @click="newQuote">New {{ documentName }}</UButton>
        <UButton v-else-if="dirty" color="gray" :disabled="saving || busy" @click="reset">Clear draft</UButton>
      </div>
    </div>
    <div v-if="initialLoadError" class="space-y-3">
      <UAlert color="red" :title="`Could not open ${documentName}`" :description="initialLoadError" />
      <UButton color="gray" :loading="busy" @click="loadQuote(savedQuoteId!)">Retry</UButton>
    </div>
    <UAlert v-if="preferenceError" color="red" :title="`Could not load ${documentName} preferences`" :description="billingErrorMessage(preferenceError)" class="mb-4" />
    <UAlert v-if="localDraftError" color="orange" title="Could not keep the local draft" :description="localDraftError" class="mb-4" />
    <UButton v-if="preferenceError" color="gray" @click="reloadQuotePreferences">Reload preferences</UButton>
    <UAlert v-if="workflow.conversionError || workflow.emailError" color="orange" title="Quote saved; invoice workflow needs attention" :description="workflow.conversionError || workflow.emailError" class="mb-4" />
    <p v-if="workflow.invoiceId" class="mb-4 text-sm text-gray-500">This quote has a linked invoice. Quote edits do not change that invoice.</p>
    <UButton v-if="workflow.invoiceDraft" color="gray" class="mb-4" :to="{ path: '/erp/invoice-drafts', query: { entryCompany: scope.companyId.value } }">Review invoice draft</UButton>
    <UAlert v-if="!canEdit" color="orange" :title="isSalesOrder ? 'This sales order is locked' : 'This accepted quote is locked'" :description="isSalesOrder ? 'Enable editing of closed/cancelled orders in Preference to make changes.' : 'Enable Allow editing of accepted quotes in Preference to make changes.'" class="mb-4" />
    <form v-if="!initialLoadError && !preferenceError" @submit.prevent="save()">
      <fieldset :disabled="saving || busy || !canEdit" class="space-y-5">
        <UCard>
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <UFormGroup label="Customer" required class="sm:col-span-2">
              <div v-if="customer" class="mb-2 flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                <div><span class="font-medium">{{ customer.name }}</span><span class="ml-2 text-sm text-gray-500">{{ customer.phone }}</span></div>
                <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-x-mark" aria-label="Change customer" @click="customer = null; form.clientId = ''" />
              </div>
              <div v-else class="relative">
                <div class="flex gap-2">
                  <UInput v-model="customerSearch" :loading="customerLoading" placeholder="Search customer name or phone" aria-label="Search customer" class="flex-1" autocomplete="off" />
                  <UButton color="gray" icon="i-heroicons-user-plus" aria-label="Add customer" @click="addClientPhone = customerSearch; showAddClient = true" />
                </div>
                <div v-if="customerMatches.length" class="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <button v-for="match in customerMatches" :key="match.id" type="button" class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-800" @click="selectCustomer(match)">{{ match.name }} <span class="text-gray-500">{{ match.phone }}</span></button>
                </div>
                <p v-else-if="customerSearch.trim() && !customerLoading && !customerError" class="mt-1 text-xs text-gray-500">No customers found. Use + to add one.</p>
                <p v-if="customerError" class="mt-1 text-xs text-red-500">{{ customerError }}</p>
              </div>
            </UFormGroup>
            <UFormGroup :label="isSalesOrder ? 'Order date' : 'Quote date'" required><UInput v-model="form.quoteDate" type="date" :aria-label="isSalesOrder ? 'Order date' : 'Quote date'" required /></UFormGroup>
            <UFormGroup :label="isSalesOrder ? 'Expected shipment date' : 'Valid until'"><UInput v-model="form.expiryDate" type="date" :min="form.quoteDate" :aria-label="isSalesOrder ? 'Expected shipment date' : 'Valid until'" /></UFormGroup>
            <UFormGroup label="Customer reference"><UInput v-model="form.referenceNumber" placeholder="e.g. PO-1042 or enquiry number" maxlength="200" /></UFormGroup>
            <UFormGroup label="Subject"><UInput v-model="form.subject" placeholder="e.g. Office furniture supply" maxlength="500" /></UFormGroup>
            <UFormGroup label="Prepared by">
              <div v-if="form.salesperson" class="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-1 dark:border-gray-700">
                <span class="truncate text-sm">{{ form.salesperson }}</span>
                <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-x-mark" aria-label="Change prepared by" @click="form.salesperson = ''; staffSearch = ''; staffMatches = []" />
              </div>
              <div v-else class="relative">
                <UInput v-model="staffSearch" :loading="staffLoading" placeholder="Search staff name, code or email" aria-label="Search prepared by" autocomplete="off" @keydown.enter.prevent="staffMatches.length === 1 && selectStaff(staffMatches[0])" @keydown.esc="staffSearch = ''" />
                <div v-if="staffMatches.length" class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <button v-for="user in staffMatches" :key="user.id" type="button" class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-800" :aria-label="`Select prepared by ${staffName(user)}`" @click="selectStaff(user)">
                    <span class="block font-medium">{{ staffName(user) }}</span><span class="block text-xs text-gray-500">{{ [user.code == null ? '' : `Code ${user.code}`, user.email].filter(Boolean).join(' · ') }}</span>
                  </button>
                </div>
                <p v-else-if="staffSearch.trim() && !staffLoading && !staffError" class="mt-1 text-xs text-gray-500">No matching active users in this company.</p>
                <div v-if="staffError" class="mt-1 text-xs text-red-500">{{ staffError }} <UButton color="gray" variant="link" size="xs" :padded="false" @click="searchStaff">Retry</UButton></div>
              </div>
            </UFormGroup>
            <UFormGroup label="Status"><USelect v-model="form.status" :options="[...statusChoices]" :aria-label="`${documentTitle} status`" /></UFormGroup>
          </div>
        </UCard>

        <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
            <div><h2 class="font-semibold">Items</h2><p class="text-xs text-gray-500">Rates include tax. Add products or type a custom item.</p></div>
            <div class="relative w-full sm:w-[34rem]">
              <div class="flex flex-col gap-2 sm:flex-row">
                <USelect v-model="productSearchField" :options="[...quoteProductSearchFields]" aria-label="Product search field" class="w-full sm:w-40 sm:shrink-0" />
                <UInput v-model="productSearch" :loading="productLoading" icon="i-heroicons-magnifying-glass" :placeholder="productSearchPlaceholder" aria-label="Search products" class="min-w-0 flex-1" autocomplete="off" @keydown.enter.prevent="products.length === 1 && addProduct(products[0])" />
              </div>
              <div v-if="products.length" class="absolute right-0 z-20 mt-1 w-full rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <button v-for="product in products" :key="product.id" type="button" class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-800" @click="addProduct(product)">
                  <span class="block font-medium">{{ product.variant.product?.name }} {{ product.variant.name }}</span>
                  <span class="text-xs text-gray-500">{{ product.barcode }} · {{ product.size }} · {{ money(product.variant.sprice) }}</span>
                  <span class="block text-xs text-gray-500">{{ [...new Set([product.variant.brand?.name, product.variant.product?.brand?.name, product.variant.product?.category?.name, product.variant.product?.collection?.name].filter(Boolean))].join(' · ') }}</span>
                </button>
              </div>
              <p v-else-if="productSearch.trim() && !productLoading && !productError" class="mt-1 text-xs text-gray-500">No in-stock products found. You can add a custom item below.</p>
              <p v-if="productError" class="mt-1 text-xs text-red-500">{{ productError }}</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[1050px] text-sm">
              <thead class="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800/50"><tr>
                <th class="px-3 py-3">#</th><th class="px-2 py-3">Item / description</th><th class="px-2 py-3">Qty</th><th class="px-2 py-3">Unit</th>
                <th class="px-2 py-3">Rate</th><th class="px-2 py-3">Discount %</th><th class="px-2 py-3">Tax %</th><th class="px-2 py-3 text-right">Amount</th><th class="px-2 py-3"><span class="sr-only">Actions</span></th>
              </tr></thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                <tr v-for="(line, index) in form.items" :key="line.id">
                  <td class="px-3 py-3 align-top text-gray-500">{{ index + 1 }}</td>
                  <td class="min-w-72 px-2 py-3">
                    <UInput v-model="line.name" :aria-label="`Item ${index + 1} name`" placeholder="Item name" maxlength="500" required />
                    <UInput v-model="line.description" :aria-label="`Item ${index + 1} description`" placeholder="Description (optional)" variant="none" size="xs" maxlength="2000" class="mt-1" />
                    <span v-if="line.barcode || line.size" class="px-2 text-xs text-gray-500">{{ [line.barcode, line.size].filter(Boolean).join(' · ') }}</span>
                  </td>
                  <td class="w-24 px-2 py-3 align-top"><UInput v-model.number="line.quantity" type="number" min="0.001" max="999999" step="0.001" :aria-label="`Item ${index + 1} quantity`" required /></td>
                  <td class="w-24 px-2 py-3 align-top"><UInput v-model="line.unit" maxlength="50" :aria-label="`Item ${index + 1} unit`" placeholder="pcs" /></td>
                  <td class="w-32 px-2 py-3 align-top"><UInput v-model.number="line.rate" type="number" min="0" max="999999999" step="0.01" :aria-label="`Item ${index + 1} rate`" required /></td>
                  <td class="w-28 px-2 py-3 align-top"><UInput v-model.number="line.discount" type="number" min="0" max="100" step="0.01" :aria-label="`Item ${index + 1} discount`" required /></td>
                  <td class="w-24 px-2 py-3 align-top"><UInput v-model.number="line.tax" type="number" min="0" max="100" step="0.01" :aria-label="`Item ${index + 1} tax`" required /></td>
                  <td class="whitespace-nowrap px-2 py-4 text-right align-top font-medium">{{ money(quoteLineAmount(line)) }}</td>
                  <td class="px-2 py-3 align-top"><UButton color="red" variant="ghost" icon="i-heroicons-x-mark" :aria-label="`Remove item ${index + 1}`" @click="removeLine(index)" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="border-t border-gray-200 p-3 dark:border-gray-800"><UButton color="gray" variant="ghost" icon="i-heroicons-plus" :disabled="form.items.length >= 200" @click="form.items.push(newQuoteLine(uuid()))">Add item</UButton></div>
        </UCard>

        <div class="grid items-start gap-5 lg:grid-cols-3">
          <UCard class="lg:col-span-2">
            <h2 class="mb-4 text-base font-semibold">Notes</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormGroup v-if="isSalesOrder" label="Payment terms"><UTextarea v-model="form.paymentTerms" placeholder="e.g. 50% advance, balance before delivery" :rows="2" maxlength="1000" /></UFormGroup>
              <UFormGroup v-if="isSalesOrder" label="Delivery method"><UTextarea v-model="form.deliveryEstimate" placeholder="e.g. Within 7 days of acceptance" :rows="2" maxlength="1000" /></UFormGroup>
              <UFormGroup label="Customer notes"><UTextarea v-model="form.notes" :aria-label="`${documentTitle} customer notes`" placeholder="Additional details for the customer" :rows="3" maxlength="5000" /></UFormGroup>
              <UFormGroup label="Terms and conditions"><UTextarea v-model="form.termsAndConditions" :aria-label="`${documentTitle} terms and conditions`" placeholder="Scope, exclusions or warranty terms" :rows="3" maxlength="10000" /></UFormGroup>
            </div>
          </UCard>
          <UCard>
            <div class="space-y-4 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span>{{ money(totals.subTotal) }}</span></div>
              <UFormGroup label="Quote discount">
                <div class="flex gap-2"><UInput v-model.number="form.discount" type="number" min="0" :max="form.discountType === 'percent' ? 100 : 999999999" step="0.01" :aria-label="`${documentTitle} discount`" class="flex-1" required /><USelect v-model="form.discountType" :options="[{ label: currency, value: 'amount' }, { label: '%', value: 'percent' }]" aria-label="Discount type" /></div>
              </UFormGroup>
              <div class="flex justify-between"><span class="text-gray-500">Discount</span><span>− {{ money(totals.discountAmount) }}</span></div>
              <UFormGroup label="Adjustment"><UInput v-model.number="form.adjustment" type="number" step="0.01" min="-999999999" max="999999999" aria-label="Adjustment" required /></UFormGroup>
              <div class="flex justify-between text-gray-500"><span>Tax included</span><span>{{ money(totals.includedTax) }}</span></div>
              <div class="flex justify-between border-t border-gray-200 pt-4 text-xl font-semibold dark:border-gray-700"><span>Total</span><span>{{ money(totals.total) }}</span></div>
            </div>
          </UCard>
        </div>
      </fieldset>
      <UAlert v-if="formError" color="red" :title="`${documentTitle} not saved`" :description="formError" class="mt-5" />
      <div class="mt-5 flex flex-wrap items-center justify-end gap-3">
        <span v-if="dirty" class="mr-auto text-xs text-gray-500">{{ isNewQuote() && !localDraftError ? 'Changes kept on this device' : 'Unsaved changes' }}</span>
        <UButton v-if="quoteId" color="gray" icon="i-heroicons-arrow-path" :disabled="saving || busy" @click="loadQuote(quoteId)">Reload saved</UButton>
        <UButton v-if="!canEdit" color="gray" icon="i-heroicons-printer" :disabled="busy" @click="preview(quoteId)">Print {{ documentName }}</UButton>
        <UButton v-if="canEdit" color="gray" icon="i-heroicons-printer" :loading="saving" :disabled="busy" @click="save(true)">Save &amp; print</UButton>
        <UButton v-if="canEdit" type="submit" icon="i-heroicons-check" :loading="saving" :disabled="busy">Save {{ documentName }}</UButton>
      </div>
    </form>

    <BillingAddClient v-if="showAddClient" v-model:model="showAddClient" v-model:phone-no="addClientPhone" :client-added="clientAdded" />
    <QuotesPrintPreview v-if="printQuote" :quote="{ ...printQuote, documentDesign: preferences.documentDesign }" :company="session" :document-title="isSalesOrder ? 'SALES ORDER' : undefined" @close="printQuote = null" />
  </UDashboardPanelContent>
</template>
