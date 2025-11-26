<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFetch } from '#app'

const useAuth = () => useNuxtApp().$auth;

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
const leastInvoice = ref<number | null>(null)   // 🔄 changed from object to single number
const errorMessage = ref<string | null>(null)

const page = ref(1)
const pageSize = 10

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
    billsValueAfter.value = data.value?.billsValueAfter ?? null
    billsValueBefore.value = data.value?.billsValueBefore ?? null
    billsCountBefore.value = data.value?.billsCountBefore ?? null
    billsCountAfter.value = data.value?.billsCountAfter ?? null
    deleteBillIds.value = data.value?.deleteBillIds ?? []
    leastInvoice.value = data.value?.leastInvoice ?? null   // 🔄 updated to match backend

    page.value = 1
  } catch (error) {
    errorMessage.value = 'Failed to preview bills. Please try again.'
    console.error('Error previewing bills:', error)
    previewResults.value = []
  } finally {
    loading.value = false
  }
}

async function handleDelete() {
  errorMessage.value = null
  loading.value = true

  try {
    const { data, error } = await useFetch('/api/cleanup/deleteCleanupBill', {
      method: 'POST',
      body: {
        startDate: new Date(form.value.startDate),
        companyId: useAuth().session.value?.companyId,
        deleteBillIds: deleteBillIds.value,
        leastInvoice: leastInvoice.value   // 🔄 send number instead of object
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

    alert('Bills deleted successfully!')
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
      <UDashboardNavbar title="Markit"></UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Error Message -->
        <UAlert v-if="errorMessage" color="red" icon="i-heroicons-exclamation-triangle" :title="errorMessage" class="mb-4" />

   <div :class="['flex justify-center gap-6',hasResults ? 'flex-row items-start' : 'flex-col items-center']">
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

      <UFormGroup label="Target Total Amount" name="targetAmount">
      <UInput
        v-model="form.targetAmount"
        type="number"
        label="Target Total Amount"
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
               <p><span class="font-semibold text-gray-700">Value to be Removed:</span> <span class="text-red-600">₹{{ billsValueBefore - billsValueAfter }}</span></p>
<p><span class="font-semibold text-gray-700">Bill to be Deleted:</span> <span class="text-red-600">{{ billsCountBefore - billsCountAfter }}</span></p>
<p><span class="font-semibold text-gray-700">Remaining Total Value:</span> <span class="text-green-700">₹{{ billsValueAfter }}</span></p>
<p><span class="font-semibold text-gray-700">Remaining Bill Count:</span> <span class="text-green-700">{{ billsCountAfter }}</span></p>

              </div>
              <div class="pt-4">
                <UButton type="button" :loading="loading" block color="red" class="w-full" @click="handleDelete">
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
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>