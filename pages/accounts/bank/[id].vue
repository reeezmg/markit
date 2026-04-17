<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { format, sub, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'
import { useFindManyStatementBatch } from '~/lib/hooks/statement-batch'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   ROUTE PARAM
--------------------------------------------------- */
const bankId = computed(() =>
  route.params.id === 'primary' ? undefined : route.params.id
)

/* ---------------------------------------------------
   DATE RANGE (AUTO FETCH)
--------------------------------------------------- */
const selectedDate = ref({
  start: startOfDay(new Date()).toISOString(),
  end: endOfDay(new Date()).toISOString(),
})

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } },
]

function isRangeSelected(duration: Duration) {
  return (
    isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
  )
}

function selectRange(duration: Duration) {
  selectedDate.value = {
    start: sub(new Date(), duration),
    end: new Date(),
  }
}

/* ---------------------------------------------------
   FETCH LEDGER (AUTO REACTIVE)
--------------------------------------------------- */

const ledgerUrl = computed(() =>
  bankId.value
    ? '/api/accounts/secondaryledger'
    : '/api/accounts/primaryledger'
)

const { data, pending, error, refresh } = await useFetch(
  ledgerUrl,
  {
    query: computed(() => ({
      ...(bankId.value && { bankId: bankId.value }),
      from: startOfDay(selectedDate.value.start).toISOString(),
      to: endOfDay(selectedDate.value.end).toISOString(),
    })),
    immediate: true,
    watch: false,
  }
)

const downloadLedgerPDF = async () => {

  const res = await $fetch.raw(
    '/api/accounts/bank-ledger.pdf',
    {
      method: 'GET',
      params: {
        from: startOfDay(selectedDate.value.start).toISOString(),
        to: endOfDay(selectedDate.value.end).toISOString()
      }
    }
  )

  const blob = new Blob([res._data], {
    type: 'application/pdf'
  })

  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = 'bank-ledger.pdf'
  a.click()

  URL.revokeObjectURL(url)
}



/* =========================
   DROPDOWN ACTIONS
========================= */

const actions = () => [
  [
    {
      label: 'Download PDF',
      icon: 'i-heroicons-arrow-down-tray',
      click: downloadLedgerPDF
    }
  ],
  // [
  //   {
  //     label: 'Download EXCEL',
  //     icon: 'i-heroicons-arrow-down-tray',
  //     click: downloadExcel,
  //     loading: excelLoading.value
  //   }
  // ]
]




watch(error, e => {
  if (e) {
    toast.add({
      title: 'Failed to load bank ledger',
      description: e.message,
      color: 'red',
    })
  }
})

/* ---------------------------------------------------
   COMPUTED
--------------------------------------------------- */
const bank = computed(() => data.value?.bank)
const ledger = computed(() => data.value?.ledger ?? [])
const closingBalance = computed(() => data.value?.closingBalance ?? 0)

const styledLedger = computed(() =>
  ledger.value.map(row => ({
    ...row,
    class: row.precedence ? 'bg-red-50 text-red-600' : undefined,
  }))
)

const totalSales = computed(() =>
  ledger.value
    .filter(r => r.source === 'SALE')
    .reduce((sum, r) => sum + Number(r.credit || 0), 0)
)

const totalExpenses = computed(() =>
  ledger.value
    .filter(r => r.source === 'EXPENSE')
    .reduce((sum, r) => sum + Number(r.debit || 0), 0)
)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(v ?? 0)

/* ---------------------------------------------------
   STATEMENT BATCHES
--------------------------------------------------- */
const statementQuery = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    ...(bankId.value ? { bankAccountId: bankId.value } : {}),
  },
  orderBy: { createdAt: 'desc' as const },
  take: 10,
  select: {
    id: true,
    status: true,
    sourceFileName: true,
    createdAt: true,
    _count: { select: { rows: true } },
  },
}))

const { data: statementBatches, refetch: refetchBatches } = useFindManyStatementBatch(statementQuery)

const goToStatement = (batchId: string) => {
  router.push(`/statement/${batchId}?bankAccountId=${bankId.value || 'PRIMARY'}`)
}

/* ---------------------------------------------------
   UPLOAD STATEMENT
--------------------------------------------------- */
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function triggerFileUpload() {
  fileInputRef.value?.click()
}

async function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    toast.add({ title: 'Unsupported file type', description: 'Please upload a PDF or image (JPG, PNG, WebP)', color: 'red' })
    input.value = ''
    return
  }

  uploading.value = true
  try {
    const base64 = await fileToBase64(file)
    const result = await $fetch('/api/statement/upload', {
      method: 'POST',
      body: {
        file: base64,
        mimeType: file.type,
        fileName: file.name,
        bankAccountId: bankId.value || undefined,
      },
    })
    toast.add({
      title: `Extracted ${result.rowCount} rows (${result.matched} auto-matched)`,
      color: 'green',
    })
    await refetchBatches()
    router.push(`/statement/${result.batchId}?bankAccountId=${bankId.value || 'PRIMARY'}`)
  } catch (err: any) {
    toast.add({ title: 'Upload failed', color: 'red', description: err.data?.statusMessage || err.message })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip data:...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">

    <!-- SUMMARY -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <UCard v-if="bank">
        <div class="text-sm text-gray-500">
          Opening Balance ({{ bank.bankName }})
        </div>
        <div class="text-xl font-semibold">
          {{ formatCurrency(bank.openingBalance) }}
        </div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">Total Sales</div>
        <div class="text-xl font-semibold text-green-600">
          {{ formatCurrency(totalSales) }}
        </div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">Total Expenses</div>
        <div class="text-xl font-semibold text-red-600">
          {{ formatCurrency(totalExpenses) }}
        </div>
      </UCard>
    </div>

    <!-- TABLE CARD -->
    <UCard
      class="w-full"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '' },
        footer: { padding: 'p-4' },
      }"
    >
      <!-- HEADER (NO APPLY BUTTON) -->
      <template #header>
         <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <UPopover :popper="{ placement: 'bottom-start' }">
          <UButton
            icon="i-heroicons-calendar-days-20-solid"
            class="w-full sm:w-64"
          >
            {{ format(selectedDate.start, 'd MMM, yyyy') }}
            -
            {{ format(selectedDate.end, 'd MMM, yyyy') }}
          </UButton>

          <template #panel="{ close }">
            <div class="flex sm:divide-x divide-gray-200 dark:divide-gray-800">
              <div class="hidden sm:flex flex-col py-4">
                <UButton
                  v-for="(range, index) in ranges"
                  :key="index"
                  :label="range.label"
                  color="gray"
                  variant="ghost"
                  class="rounded-none px-6"
                  :class="isRangeSelected(range.duration)
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                  @click="selectRange(range.duration)"
                />
              </div>

              <DatePicker
                v-model="selectedDate"
                @close="refresh(); close()"
              />
            </div>
          </template>
        </UPopover>

           <UDropdown :items="actions()">
            <UButton
              label="Export"
              icon="i-heroicons-chevron-down"
              color="primary"
            />
          </UDropdown>
          </div>
      </template>

      <!-- TABLE -->
      <UTable
        :rows="styledLedger"
        :loading="pending"
        :columns="[
          { key: 'date', label: 'Date' },
          { key: 'source', label: 'Source' },
          { key: 'description', label: 'Description' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'runningBalance', label: 'Balance' },
        ]"
      >
        <template #date-data="{ row }">
          <span v-if="row.source !== 'OPENING'">
            {{ format(new Date(row.date), 'dd MMM yyyy') }}
          </span>
          <span v-else class="text-gray-400">—</span>
        </template>

        <template #debit-data="{ row }">
          <span v-if="row.debit > 0" class="text-red-600">
            {{ formatCurrency(row.debit) }}
          </span>
          <span v-else>-</span>
        </template>

        <template #credit-data="{ row }">
          <span v-if="row.credit > 0" class="text-green-600">
            {{ formatCurrency(row.credit) }}
          </span>
          <span v-else>-</span>
        </template>

        <template #runningBalance-data="{ row }">
          {{ formatCurrency(row.runningBalance) }}
        </template>

        <template #source-data="{ row }">
          <UBadge size="xs" color="gray">
            {{ row.source }}
          </UBadge>
        </template>
      </UTable>

      <!-- FOOTER -->
      <template #footer>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-500">Closing Balance</span>
          <span class="text-xl font-semibold">
            {{ formatCurrency(closingBalance) }}
          </span>
        </div>
      </template>
    </UCard>

    <!-- STATEMENT BATCHES -->
    <UCard
      class="w-full mt-4"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-4' },
        body: { padding: '' },
      }"
    >
      <template #header>
        <div class="flex justify-between items-center">
          <h2 class="font-semibold text-sm">Statement Processing</h2>
          <input
            ref="fileInputRef"
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            class="hidden"
            @change="handleFileUpload"
          />
          <UButton
            label="Upload Statement"
            icon="i-heroicons-document-arrow-up"
            size="sm"
            color="primary"
            variant="soft"
            :loading="uploading"
            @click="triggerFileUpload"
          />
        </div>
      </template>

      <div v-if="statementBatches?.length" class="divide-y divide-gray-200 dark:divide-gray-700">
        <button
          v-for="sb in statementBatches"
          :key="sb.id"
          class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors flex items-center justify-between gap-3"
          @click="goToStatement(sb.id)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UIcon
              :name="sb.status === 'EXECUTED' ? 'i-heroicons-check-circle' : 'i-heroicons-clock'"
              :class="sb.status === 'EXECUTED' ? 'text-green-500' : 'text-yellow-500'"
            />
            <div class="min-w-0">
              <p class="text-sm truncate">{{ sb.sourceFileName || 'Statement' }}</p>
              <p class="text-xs text-gray-500">
                {{ format(new Date(sb.createdAt), 'dd MMM yyyy, hh:mm a') }}
                · {{ sb._count?.rows ?? 0 }} rows
              </p>
            </div>
          </div>
          <UBadge
            :color="sb.status === 'EXECUTED' ? 'green' : 'yellow'"
            variant="subtle"
            size="xs"
          >
            {{ sb.status }}
          </UBadge>
        </button>
      </div>
      <div v-else class="px-4 py-6 text-center text-sm text-gray-500">
        <UIcon name="i-heroicons-document-text" class="text-2xl mb-2" />
        <p>No statements processed yet.</p>
        <p class="text-xs mt-1">Upload a bank statement PDF in the AI chat to get started.</p>
      </div>
    </UCard>
  </UDashboardPanelContent>
</template>
