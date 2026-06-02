<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFetch } from '#app'

const useAuth = () => useNuxtApp().$auth

const showCodeInput = ref(false)
const codeInputVal = ref('')
const codeInputRef = ref<HTMLInputElement | null>(null)
const unlocked = useState('cleanup-unlocked', () => false)

function handleShortcut(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'u') {
    e.preventDefault()
    codeInputVal.value = ''
    showCodeInput.value = true
    nextTick(() => {
      codeInputRef.value?.focus()
      console.log('[cleanup] input focused')
    })
  }
}

function submitCode() {
  if (!codeInputVal.value) return
  const session = useAuth()?.session?.value
  if (codeInputVal.value === session?.cleanupCode) {
    unlocked.value = true
    console.log('[cleanup] access granted')
  } else {
    console.log('[cleanup] wrong code')
  }
  showCodeInput.value = false
  codeInputVal.value = ''
}

function closeCodeInput() {
  showCodeInput.value = false
  codeInputVal.value = ''
}

watch(codeInputVal, (val) => {
  if (showCodeInput.value) console.log('[cleanup] typed:', val)
})

onMounted(() => window.addEventListener('keydown', handleShortcut))
onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
  unlocked.value = false
})

const hasAccess = computed(() => {
  const session = useAuth()?.session?.value
  if (!session?.cleanup) return false
  return unlocked.value
})

const form = ref({
  startDate: '',
  endDate: '',
  targetAmount: 0,
  timePref: 'oldest',
  valuePref: 'lowest',
  minBillAmount: 0,
  paymentMethod: 'Cash',
  reductionRules: [
    { fromAmount: 0, toAmount: 0, reducePercent: 100 },
  ],
})

const activeTab = ref<'delete' | 'reduce' | 'bulk-payment'>('delete')

const timePreferences = [
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Newest First', value: 'newest' }
]

const valuePreferences = [
  { label: 'Lowest Value First', value: 'lowest' },
  { label: 'Highest Value First', value: 'highest' }
]

const paymentMethods = [
  { label: 'Cash', value: 'Cash' },
  { label: 'Card', value: 'Card' },
  { label: 'UPI', value: 'UPI' },
  { label: 'All', value: '' }
]

const bulkPaymentMethods = [
  { label: 'Cash', value: 'Cash' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'Card' },
  { label: 'Credit', value: 'Credit' },
]

const bulkPaymentForm = ref({
  startDate: '',
  endDate: '',
  amount: 0,
  sourceMethods: [] as string[],
  targetMethod: 'Cash',
  timePref: 'oldest',
  valuePref: 'lowest',
})

watch(() => bulkPaymentForm.value.targetMethod, (targetMethod) => {
  bulkPaymentForm.value.sourceMethods = bulkPaymentForm.value.sourceMethods.filter(
    (method) => method !== targetMethod
  )
})

const bulkPaymentLoading = ref(false)
const bulkPaymentPlan = ref<any[]>([])
const bulkPaymentSummary = ref<any | null>(null)
const bulkPaymentError = ref<string | null>(null)

const previewResults = ref<any[]>([])
const loading = ref(false)
const billsValueAfter = ref<number | null>(null)
const billsValueBefore = ref<number | null>(null)
const billsCountBefore = ref<number | null>(null)
const billsCountAfter = ref<number | null>(null)
const deleteBillIds = ref<string[]>([])
const reductionPlan = ref<any[]>([])
const reductionAmount = ref<number>(0)
const reductionRemainingAmount = ref<number>(0)
const reducedBillsCount = ref<number>(0)
const leastInvoice = ref<number | null>(null)
const errorMessage = ref<string | null>(null)
const previewMode = ref<'delete' | 'reduce' | null>(null)
const hasPreviewed = ref(false)

const page = ref(1)
const pageSize = 10

// Modal state
const showDeleteModal = ref(false)

function optionValue<T>(value: T | { value?: T }) {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value
  }
  return value
}

function buildCleanupPreviewPayload() {
  const startDate = new Date(form.value.startDate)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date(form.value.endDate)
  endDate.setHours(23, 59, 59, 999)

  return {
    ...form.value,
    startDate,
    endDate,
    companyId: useAuth().session.value?.companyId,
    targetAmount: Number(form.value.targetAmount || 0),
    minBillAmount: Number(form.value.minBillAmount || 0),
    reductionRules: form.value.reductionRules.map((rule) => ({
      fromAmount: Number(rule.fromAmount || 0),
      toAmount: Number(rule.toAmount || 0),
      reducePercent: Number(rule.reducePercent || 0),
    })),
    paymentMethod: optionValue(form.value.paymentMethod) || '',
    timePref: optionValue(form.value.timePref) || 'oldest',
    valuePref: optionValue(form.value.valuePref) || 'lowest',
  }
}

function addReductionRule() {
  form.value.reductionRules.push({ fromAmount: 0, toAmount: 0, reducePercent: 100 })
}

function removeReductionRule(index: number) {
  if (form.value.reductionRules.length === 1) return
  form.value.reductionRules.splice(index, 1)
}

function switchTab(tab: 'delete' | 'reduce' | 'bulk-payment') {
  activeTab.value = tab
  previewResults.value = []
  previewMode.value = null
  hasPreviewed.value = false
  page.value = 1
  showDeleteModal.value = false
}

async function handleBulkPaymentPreview(dryRun = true) {
  bulkPaymentError.value = null
  bulkPaymentLoading.value = true

  try {
    const { data, error } = await useFetch('/api/cleanup/bulkPaymentMethod', {
      method: 'POST',
      body: {
        ...bulkPaymentForm.value,
        startDate: new Date(new Date(bulkPaymentForm.value.startDate).setHours(0, 0, 0, 0)),
        endDate: new Date(new Date(bulkPaymentForm.value.endDate).setHours(23, 59, 59, 999)),
        companyId: useAuth().session.value?.companyId,
        dryRun,
      },
    })

    if (error.value) {
      throw error.value
    }

    bulkPaymentSummary.value = data.value
    bulkPaymentPlan.value = (data.value as any)?.plan ?? []

    if (!dryRun) {
      alert('Bulk payment method updated successfully!')
      bulkPaymentPlan.value = []
      bulkPaymentSummary.value = null
    }
  } catch (error) {
    bulkPaymentError.value = dryRun
      ? 'Failed to preview bulk payment change. Please try again.'
      : 'Failed to apply bulk payment change. Please try again.'
    console.error('Bulk payment method cleanup error:', error)
  } finally {
    bulkPaymentLoading.value = false
  }
}

async function handlePreview(mode: 'delete' | 'reduce') {
  errorMessage.value = null
  loading.value = true
  previewMode.value = mode
  hasPreviewed.value = false

  try {
    const response = await $fetch<any>('/api/cleanup/getCleanupBill', {
      method: 'POST',
      body: buildCleanupPreviewPayload()
    })

    previewResults.value = mode === 'reduce'
      ? (response?.reductionPlan ?? [])
      : (response?.preview ?? [])
    billsValueAfter.value = response?.billsValueAfter ?? null
    billsValueBefore.value = response?.billsValueBefore ?? null
    billsCountBefore.value = response?.billsCountBefore ?? null
    billsCountAfter.value = response?.billsCountAfter ?? null
    deleteBillIds.value = response?.deleteBillIds ?? []
    reductionPlan.value = response?.reductionPlan ?? []
    reductionAmount.value = Number(response?.reductionAmount ?? 0)
    reductionRemainingAmount.value = Number(response?.reductionRemainingAmount ?? 0)
    reducedBillsCount.value = Number(response?.reducedBillsCount ?? 0)
    leastInvoice.value = response?.leastInvoice ?? null

    page.value = 1
    hasPreviewed.value = true
  } catch (error) {
    errorMessage.value = 'Failed to preview bills. Please try again.'
    console.error('Error previewing bills:', error)
    previewResults.value = []
    previewMode.value = null
    hasPreviewed.value = false
  } finally {
    loading.value = false
  }
}

async function handleDelete(deleteType: 'permanent' | 'soft' | 'reduce') {
  showDeleteModal.value = false
  errorMessage.value = null
  loading.value = true

  try {
    const { data, error } = await useFetch('/api/cleanup/deleteCleanupBill', {
      method: 'POST',
      body: {
        startDate: new Date(form.value.startDate),
        companyId: useAuth().session.value?.companyId,
        deleteBillIds: deleteBillIds.value,
        reductionPlan: reductionPlan.value,
        leastInvoice: leastInvoice.value,
        deleteType,
      }
    })

    if (error.value) {
      throw error.value
    }

    previewResults.value = []
    previewMode.value = null
    hasPreviewed.value = false
    billsValueAfter.value = null
    billsValueBefore.value = null
    billsCountBefore.value = null
    billsCountAfter.value = null
    deleteBillIds.value = []
    reductionPlan.value = []
    reductionAmount.value = 0
    reductionRemainingAmount.value = 0
    reducedBillsCount.value = 0

    const label = deleteType === 'soft' ? 'soft-deleted' : deleteType === 'reduce' ? 'reduced' : 'permanently deleted'
    alert(`Bills ${label} successfully!`)
  } catch (error) {
    errorMessage.value = 'Failed to delete bills. Please try again.'
    console.error('Error deleting bills:', error)
  } finally {
    loading.value = false
  }
}

const paginatedRows = computed(() => {
  return previewResults.value?.slice((page.value - 1) * pageSize, page.value * pageSize) || []
})

const hasResults = computed(() => previewResults.value?.length > 0)
const showEmptyPreview = computed(() => hasPreviewed.value && !loading.value && !hasResults.value)

const previewRemainingValue = computed(() => {
  if (previewMode.value === 'reduce') {
    return (billsValueBefore.value ?? 0) - reductionAmount.value
  }
  return billsValueAfter.value
})

const previewRemainingCount = computed(() => {
  if (previewMode.value === 'reduce') {
    return billsCountBefore.value
  }
  return billsCountAfter.value
})

const previewColumns = computed(() => {
  if (previewMode.value === 'reduce') {
    return [
      { key: 'invoiceNumber', label: 'Inv #' },
      { key: 'billTotal', label: 'Original Total' },
      { key: 'reductionRule', label: 'Rule' },
      { key: 'reducePercent', label: 'Reduce %' },
      { key: 'reduceBy', label: 'Reduce By' },
      { key: 'reducedTotal', label: 'Reduced Total' },
    ]
  }

  return [
    { key: 'action', label: 'Action' },
    { key: 'invoiceNumber', label: 'Inv #' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'billTotal', label: 'Original Total' },
  ]
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar v-if="hasAccess" title="Markit"></UDashboardNavbar>

      <!-- 404 screen — shown when cleanup access is off or code is missing/wrong -->
      <div v-if="!hasAccess" class="flex flex-col items-center justify-center h-full gap-4 text-center">
        <p class="text-4xl font-bold text-orange-500">404</p>
        <h1 class="text-5xl font-bold text-gray-900">Page not found</h1>
        <p class="text-gray-400 text-base">This is not the page you're looking for.</p>
        <UButton color="orange" size="lg" class="mt-2" to="/">Go back home</UButton>
      </div>

      <UDashboardPanelContent v-else>
        <!-- Error Message -->
        <UAlert v-if="errorMessage" color="red" icon="i-heroicons-exclamation-triangle" :title="errorMessage" class="mb-4" />

        <div class="flex justify-center mb-6">
          <div class="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <UButton
              type="button"
              :color="activeTab === 'delete' ? 'primary' : 'gray'"
              :variant="activeTab === 'delete' ? 'solid' : 'ghost'"
              @click="switchTab('delete')"
            >
              Bill Delete
            </UButton>
            <UButton
              type="button"
              :color="activeTab === 'reduce' ? 'primary' : 'gray'"
              :variant="activeTab === 'reduce' ? 'solid' : 'ghost'"
              @click="switchTab('reduce')"
            >
              Bill Reduce
            </UButton>
            <UButton
              type="button"
              :color="activeTab === 'bulk-payment' ? 'primary' : 'gray'"
              :variant="activeTab === 'bulk-payment' ? 'solid' : 'ghost'"
              @click="switchTab('bulk-payment')"
            >
              Bulk Payment Method
            </UButton>
          </div>
        </div>

        <div v-if="activeTab !== 'bulk-payment'" :class="['flex justify-center gap-6', hasResults ? 'flex-row items-start' : 'flex-col items-center']">
          <!-- Form Card -->
          <UCard class="max-w-xl w-[400px] p-4 space-y-6">
            <UForm :state="form" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormGroup label="Start Date" name="startDate">
                  <UInput v-model="form.startDate" type="date" label="Start Date" required />
                </UFormGroup>
                <UFormGroup label="End Date" name="endDate">
                  <UInput v-model="form.endDate" type="date" label="End Date" required />
                </UFormGroup>
              </div>

              <UFormGroup label="Target Balance Amount" name="targetAmount">
                <UInput
                  v-model="form.targetAmount"
                  type="number"
                  label="Target Balance Amount"
                  placeholder="e.g. 50000"
                  required
                />
              </UFormGroup>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormGroup label="Time Preference" name="timePref">
                  <USelect
                    v-model="form.timePref"
                    :options="timePreferences"
                    label="Time Preference"
                    option-attribute="label"
                    value-attribute="value"
                    required
                  />
                </UFormGroup>
                <UFormGroup label="Value Preference" name="valuePref">
                  <USelect
                    v-model="form.valuePref"
                    :options="valuePreferences"
                    label="Value Preference"
                    option-attribute="label"
                    value-attribute="value"
                    required
                  />
                </UFormGroup>
              </div>

              <UFormGroup v-if="activeTab === 'delete'" label="Minimum Bill Amount" name="minBillAmount">
                <UInput
                  v-model="form.minBillAmount"
                  type="number"
                  label="Minimum Bill Amount"
                />
              </UFormGroup>

              <UFormGroup label="Payment Method" name="paymentMethod">
                <USelect
                  v-model="form.paymentMethod"
                  :options="paymentMethods"
                  label="Payment Method"
                  option-attribute="label"
                  value-attribute="value"
                />
              </UFormGroup>

              <div v-if="activeTab === 'reduce'" class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium text-gray-700">Reduction Rules</p>
                  <UButton type="button" size="xs" color="orange" variant="soft" @click="addReductionRule">
                    Add Rule
                  </UButton>
                </div>

                <div
                  v-for="(rule, index) in form.reductionRules"
                  :key="index"
                  class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
                >
                  <UFormGroup label="From" :name="`reductionRules.${index}.fromAmount`">
                    <UInput v-model="rule.fromAmount" type="number" min="0" placeholder="0" />
                  </UFormGroup>
                  <UFormGroup label="To" :name="`reductionRules.${index}.toAmount`">
                    <UInput v-model="rule.toAmount" type="number" min="0" placeholder="0" />
                  </UFormGroup>
                  <UFormGroup label="Reduce %" :name="`reductionRules.${index}.reducePercent`">
                    <UInput v-model="rule.reducePercent" type="number" min="0" max="100" placeholder="100" />
                  </UFormGroup>
                  <UButton
                    type="button"
                    icon="i-heroicons-trash"
                    color="red"
                    variant="ghost"
                    :disabled="form.reductionRules.length === 1"
                    @click="removeReductionRule(index)"
                  />
                </div>
              </div>

              <div class="pt-4">
                <UButton v-if="activeTab === 'delete'" type="button" :loading="loading && previewMode === 'delete'" block color="red" class="w-full" @click="handlePreview('delete')">
                  Preview Delete
                </UButton>
                <UButton v-else type="button" :loading="loading && previewMode === 'reduce'" block color="orange" class="w-full" @click="handlePreview('reduce')">
                  Preview Reduce
                </UButton>
              </div>
            </UForm>

            <!-- Results Summary -->
            <div v-if="hasResults" class="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6 shadow-sm">
              <h3 class="text-lg font-bold mb-2 text-primary-700">
                {{ previewMode === 'reduce' ? 'Reduce Preview Result' : 'Delete Preview Result' }}
              </h3>
              <div class="grid grid-cols-1 gap-1 text-sm">
                <template v-if="previewMode === 'delete'">
                  <p><span class="font-semibold text-gray-700">Value to be Removed:</span> <span class="text-red-600">₹{{ (billsValueBefore ?? 0) - (billsValueAfter ?? 0) }}</span></p>
                  <p><span class="font-semibold text-gray-700">Bill to be Deleted:</span> <span class="text-red-600">{{ (billsCountBefore ?? 0) - (billsCountAfter ?? 0) }}</span></p>
                </template>
                <template v-else>
                  <p><span class="font-semibold text-gray-700">Value to Reduce:</span> <span class="text-orange-600">₹{{ reductionAmount }}</span></p>
                  <p><span class="font-semibold text-gray-700">Bill to be Reduced:</span> <span class="text-orange-600">{{ reducedBillsCount }}</span></p>
                  <p v-if="reductionRemainingAmount > 0"><span class="font-semibold text-gray-700">Still Above Target:</span> <span class="text-red-600">₹{{ reductionRemainingAmount }}</span></p>
                </template>
                <p><span class="font-semibold text-gray-700">Remaining Total Value:</span> <span class="text-green-700">₹{{ previewRemainingValue }}</span></p>
                <p><span class="font-semibold text-gray-700">Remaining Bill Count:</span> <span class="text-green-700">{{ previewRemainingCount }}</span></p>
              </div>
              <div class="pt-4">
                <UButton type="button" :loading="loading" block :color="previewMode === 'reduce' ? 'orange' : 'red'" class="w-full" @click="showDeleteModal = true">
                  {{ previewMode === 'reduce' ? 'Confirm Reduce' : 'Confirm Delete' }}
                </UButton>
              </div>
            </div>

            <div v-else-if="showEmptyPreview" class="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6 text-sm text-gray-700">
              <p class="font-semibold text-gray-900">
                {{ previewMode === 'reduce' ? 'No bills can be reduced for this selection.' : 'No bills matched this preview.' }}
              </p>
              <p class="mt-1 text-gray-500">
                Check the target amount, payment method, date range, and reduction rules.
              </p>
            </div>
          </UCard>

          <!-- Results Table -->
          <UCard v-if="hasResults" class="max-w-xl w-[400px] mt-0 p-4 space-y-4">
            <UTable
              :rows="paginatedRows"
              :columns="previewColumns"
            />

            <UPagination
              v-model="page"
              :total="previewResults.length"
              :page-count="pageSize"
              class="mt-2"
            />
          </UCard>
        </div>

        <div v-else class="flex justify-center gap-6 items-start">
          <UCard class="max-w-xl w-[420px] p-4 space-y-6">
            <UAlert v-if="bulkPaymentError" color="red" icon="i-heroicons-exclamation-triangle" :title="bulkPaymentError" class="mb-4" />

            <UForm :state="bulkPaymentForm" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormGroup label="Start Date" name="startDate">
                  <UInput v-model="bulkPaymentForm.startDate" type="date" required />
                </UFormGroup>
                <UFormGroup label="End Date" name="endDate">
                  <UInput v-model="bulkPaymentForm.endDate" type="date" required />
                </UFormGroup>
              </div>

              <UFormGroup label="Amount to Shift" name="amount">
                <UInput v-model="bulkPaymentForm.amount" type="number" min="1" required />
              </UFormGroup>

              <UFormGroup label="Change From" name="sourceMethods">
                <USelectMenu
                  v-model="bulkPaymentForm.sourceMethods"
                  :options="bulkPaymentMethods.filter(method => method.value !== bulkPaymentForm.targetMethod)"
                  multiple
                  option-attribute="label"
                  value-attribute="value"
                />
              </UFormGroup>

              <UFormGroup label="Change To" name="targetMethod">
                <USelect
                  v-model="bulkPaymentForm.targetMethod"
                  :options="bulkPaymentMethods"
                  option-attribute="label"
                  value-attribute="value"
                />
              </UFormGroup>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UFormGroup label="Time Preference" name="timePref">
                  <USelect v-model="bulkPaymentForm.timePref" :options="timePreferences" option-attribute="label" value-attribute="value" />
                </UFormGroup>
                <UFormGroup label="Value Preference" name="valuePref">
                  <USelect v-model="bulkPaymentForm.valuePref" :options="valuePreferences" option-attribute="label" value-attribute="value" />
                </UFormGroup>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                <UButton type="button" color="orange" block :loading="bulkPaymentLoading" @click="handleBulkPaymentPreview(true)">
                  Preview Change
                </UButton>
                <UButton type="button" color="red" block :loading="bulkPaymentLoading" :disabled="!bulkPaymentPlan.length" @click="handleBulkPaymentPreview(false)">
                  Apply Change
                </UButton>
              </div>
            </UForm>

            <div v-if="bulkPaymentSummary" class="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6 shadow-sm">
              <h3 class="text-lg font-bold mb-2 text-primary-700">Bulk Payment Preview</h3>
              <div class="grid grid-cols-1 gap-1 text-sm">
                <p><span class="font-semibold text-gray-700">Requested:</span> <span>₹{{ bulkPaymentSummary.requestedAmount }}</span></p>
                <p><span class="font-semibold text-gray-700">Can Shift:</span> <span class="text-orange-600">₹{{ bulkPaymentSummary.shiftedAmount }}</span></p>
                <p><span class="font-semibold text-gray-700">Remaining:</span> <span class="text-red-600">₹{{ bulkPaymentSummary.remainingAmount }}</span></p>
                <p><span class="font-semibold text-gray-700">Affected Bills:</span> <span>{{ bulkPaymentSummary.affectedBillsCount }}</span></p>
              </div>
            </div>
          </UCard>

          <UCard v-if="bulkPaymentPlan.length" class="max-w-3xl w-[720px] mt-0 p-4 space-y-4">
            <UTable
              :rows="bulkPaymentPlan"
              :columns="[
                { key: 'invoiceNumber', label: 'Inv #' },
                { key: 'grandTotal', label: 'Grand Total' },
                { key: 'oldPaymentMethod', label: 'Old Method' },
                { key: 'movedAmount', label: 'Moved' },
                { key: 'movedTo', label: 'To' },
                { key: 'newPaymentMethod', label: 'New Method' }
              ]"
            />
          </UCard>
        </div>

        <!-- Delete Type Modal -->
        <UModal v-model="showDeleteModal" prevent-close>
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-exclamation-triangle" class="text-red-500 w-5 h-5" />
                <span class="font-semibold text-gray-900">Choose Cleanup Type</span>
              </div>
            </template>

            <div class="space-y-3 text-sm text-gray-700">
              <p>{{ previewMode === 'reduce' ? 'Confirm amount reduction for the previewed bills.' : 'Choose how to remove the previewed bills.' }}</p>

              <div v-if="previewMode === 'delete'" class="bg-red-50 border border-red-200 rounded-lg p-3">
                <p class="font-semibold text-red-700">Permanent Delete</p>
                <p class="text-red-600 text-xs mt-1">Bills and their history are erased from the database. This cannot be undone.</p>
              </div>

              <div v-if="previewMode === 'delete'" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p class="font-semibold text-yellow-700">Soft Delete</p>
                <p class="text-yellow-600 text-xs mt-1">Bills and their history are marked with <code class="bg-yellow-100 px-1 rounded">precedence = true</code> and hidden. Data is preserved.</p>
              </div>

              <div v-if="previewMode === 'reduce'" class="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p class="font-semibold text-orange-700">Reduce Amount</p>
                <p class="text-orange-600 text-xs mt-1">Bills stay visible. Original bill totals and entry rate/value are saved, then visible bill and entry amounts are reduced.</p>
              </div>
            </div>

            <template #footer>
              <div class="flex gap-3 justify-end">
                <UButton color="gray" variant="ghost" @click="showDeleteModal = false" :disabled="loading">
                  Cancel
                </UButton>
                <UButton v-if="previewMode === 'delete'" color="yellow" :loading="loading" @click="handleDelete('soft')">
                  Soft Delete
                </UButton>
                <UButton v-if="previewMode === 'reduce'" color="orange" :loading="loading" :disabled="!reductionPlan.length" @click="handleDelete('reduce')">
                  Reduce Amount
                </UButton>
                <UButton v-if="previewMode === 'delete'" color="red" :loading="loading" @click="handleDelete('permanent')">
                  Permanent Delete
                </UButton>
              </div>
            </template>
          </UCard>
        </UModal>

      </UDashboardPanelContent>
    </UDashboardPanel>
    <!-- Secret code input — triggered by Ctrl+U -->
    <div
      v-if="showCodeInput"
      class="fixed inset-0 z-50 flex items-center justify-center"
      @click.self="closeCodeInput"
    >
      <input
        ref="codeInputRef"
        v-model="codeInputVal"
        type="text"
        maxlength="10"
        autocomplete="off"
        data-lpignore="true"
        data-bwignore="true"
        class="opacity-0 absolute pointer-events-none"
        @keydown.enter="submitCode"
        @keydown.esc="closeCodeInput"
      />
    </div>
  </UDashboardPage>
</template>
