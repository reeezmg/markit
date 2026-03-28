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
  paymentMethod: 'Cash'
})

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

const previewResults = ref<any[]>([])
const loading = ref(false)
const billsValueAfter = ref<number | null>(null)
const billsValueBefore = ref<number | null>(null)
const billsCountBefore = ref<number | null>(null)
const billsCountAfter = ref<number | null>(null)
const deleteBillIds = ref<string[]>([])
const leastInvoice = ref<number | null>(null)
const errorMessage = ref<string | null>(null)

const page = ref(1)
const pageSize = 10

// Modal state
const showDeleteModal = ref(false)

async function handleSubmit() {
  errorMessage.value = null
  loading.value = true

  try {
    const { data, error } = await useFetch('/api/cleanup/getCleanupBill', {
      method: 'POST',
      body: {
        ...form.value,
        startDate: new Date(new Date(form.value.startDate).setHours(0, 0, 0, 0)),
        endDate: new Date(new Date(form.value.endDate).setHours(23, 59, 59, 999)),
        companyId: useAuth().session.value?.companyId
      }
    })

    if (error.value) {
      throw error.value
    }

    previewResults.value = data.value?.preview ?? []
    billsValueAfter.value = (data.value as any)?.billsValueAfter ?? null
    billsValueBefore.value = (data.value as any)?.billsValueBefore ?? null
    billsCountBefore.value = (data.value as any)?.billsCountBefore ?? null
    billsCountAfter.value = (data.value as any)?.billsCountAfter ?? null
    deleteBillIds.value = data.value?.deleteBillIds ?? []
    leastInvoice.value = data.value?.leastInvoice ?? null

    page.value = 1
  } catch (error) {
    errorMessage.value = 'Failed to preview bills. Please try again.'
    console.error('Error previewing bills:', error)
    previewResults.value = []
  } finally {
    loading.value = false
  }
}

async function handleDelete(deleteType: 'permanent' | 'soft') {
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
        leastInvoice: leastInvoice.value,
        deleteType,
      }
    })

    if (error.value) {
      throw error.value
    }

    previewResults.value = []
    billsValueAfter.value = null
    billsValueBefore.value = null
    billsCountBefore.value = null
    billsCountAfter.value = null

    const label = deleteType === 'soft' ? 'soft-deleted' : 'permanently deleted'
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

        <div :class="['flex justify-center gap-6', hasResults ? 'flex-row items-start' : 'flex-col items-center']">
          <!-- Form Card -->
          <UCard class="max-w-xl w-[400px] p-4 space-y-6">
            <UForm :state="form" @submit="handleSubmit" class="space-y-4">
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
                    required
                  />
                </UFormGroup>
                <UFormGroup label="Value Preference" name="valuePref">
                  <USelect
                    v-model="form.valuePref"
                    :options="valuePreferences"
                    label="Value Preference"
                    option-attribute="label"
                    required
                  />
                </UFormGroup>
              </div>

              <UFormGroup label="Minimum Bill Amount" name="minBillAmount">
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
                />
              </UFormGroup>

              <div class="pt-4">
                <UButton type="submit" :loading="loading" block class="w-full">
                  Preview Deletion
                </UButton>
              </div>
            </UForm>

            <!-- Results Summary -->
            <div v-if="hasResults" class="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6 shadow-sm">
              <h3 class="text-lg font-bold mb-2 text-primary-700">Preview Result</h3>
              <div class="grid grid-cols-1 gap-1 text-sm">
                <p><span class="font-semibold text-gray-700">Value to be Removed:</span> <span class="text-red-600">₹{{ (billsValueBefore ?? 0) - (billsValueAfter ?? 0) }}</span></p>
                <p><span class="font-semibold text-gray-700">Bill to be Deleted:</span> <span class="text-red-600">{{ (billsCountBefore ?? 0) - (billsCountAfter ?? 0) }}</span></p>
                <p><span class="font-semibold text-gray-700">Remaining Total Value:</span> <span class="text-green-700">₹{{ billsValueAfter }}</span></p>
                <p><span class="font-semibold text-gray-700">Remaining Bill Count:</span> <span class="text-green-700">{{ billsCountAfter }}</span></p>
              </div>
              <div class="pt-4">
                <UButton type="button" :loading="loading" block color="red" class="w-full" @click="showDeleteModal = true">
                  Confirm Deletion
                </UButton>
              </div>
            </div>
          </UCard>

          <!-- Results Table -->
          <UCard v-if="hasResults" class="max-w-xl w-[400px] mt-0 p-4 space-y-4">
            <UTable
              :rows="paginatedRows"
              :columns="[
                { key: 'action', label: 'Action' },
                { key: 'invoiceNumber', label: 'Inv #' },
                { key: 'paymentMethod', label: 'Payment Method' },
                { key: 'billTotal', label: 'Original Total' }
              ]"
            />

            <UPagination
              v-model="page"
              :total="previewResults.length"
              :page-count="pageSize"
              class="mt-2"
            />
          </UCard>
        </div>

        <!-- Delete Type Modal -->
        <UModal v-model="showDeleteModal" prevent-close>
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-exclamation-triangle" class="text-red-500 w-5 h-5" />
                <span class="font-semibold text-gray-900">Choose Deletion Type</span>
              </div>
            </template>

            <div class="space-y-3 text-sm text-gray-700">
              <p>How do you want to remove the <span class="font-semibold text-red-600">{{ deleteBillIds.length }}</span> selected bills?</p>

              <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                <p class="font-semibold text-red-700">Permanent Delete</p>
                <p class="text-red-600 text-xs mt-1">Bills and their history are erased from the database. This cannot be undone.</p>
              </div>

              <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p class="font-semibold text-yellow-700">Soft Delete</p>
                <p class="text-yellow-600 text-xs mt-1">Bills and their history are marked with <code class="bg-yellow-100 px-1 rounded">precedence = true</code> and hidden. Data is preserved.</p>
              </div>
            </div>

            <template #footer>
              <div class="flex gap-3 justify-end">
                <UButton color="gray" variant="ghost" @click="showDeleteModal = false" :disabled="loading">
                  Cancel
                </UButton>
                <UButton color="yellow" :loading="loading" @click="handleDelete('soft')">
                  Soft Delete
                </UButton>
                <UButton color="red" :loading="loading" @click="handleDelete('permanent')">
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
