<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { format, sub, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'

const toast = useToast()

/* ---------------------------------------------------
   DATE RANGE (AUTO FETCH)
--------------------------------------------------- */
const selectedDate = ref({
  start: startOfDay(new Date()),
  end: endOfDay(new Date()),
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
   FETCH CASH LEDGER
--------------------------------------------------- */
const { data, pending, error, refresh } = await useFetch(
  '/api/accounts/cashledger',
  {
    query: computed(() => ({
      from: selectedDate.value.start.toISOString(),
      to: selectedDate.value.end.toISOString(),
    })),
    immediate: true,
    watch: false,
  }
)

watch(error, e => {
  if (e) {
    toast.add({
      title: 'Failed to load cash ledger',
      description: e.message,
      color: 'red',
    })
  }
})

/* ---------------------------------------------------
   COMPUTED
--------------------------------------------------- */
const account = computed(() => data.value?.account)
const ledger = computed(() => data.value?.ledger ?? [])
const closingBalance = computed(() => data.value?.closingBalance ?? 0)

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


/* =========================
   DROPDOWN ACTIONS
========================= */

const actions = () => [
  [
    {
      label: 'Download PDF',
      icon: 'i-heroicons-arrow-down-tray',
      click: downloadCashLedgerPDF,
    }
  ]
]

const downloadCashLedgerPDF = async () => {

  const res = await $fetch.raw(
    '/api/accounts/cash-ledger.pdf',
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
  a.download = 'cash-ledger.pdf'
  a.click()

  URL.revokeObjectURL(url)
}


const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(v ?? 0)
</script>

<template>
  <UDashboardPanelContent class="pb-24">

    <!-- SUMMARY -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <UCard v-if="account">
        <div class="text-sm text-gray-500">
          Opening Balance (Cash)
        </div>
        <div class="text-xl font-semibold">
          {{ formatCurrency(account.openingBalance) }}
        </div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">Total Cash In</div>
        <div class="text-xl font-semibold text-green-600">
          {{ formatCurrency(totalSales) }}
        </div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">Total Cash Out</div>
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
      <!-- HEADER -->
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
         <!-- Export -->
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
        :rows="ledger"
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
  </UDashboardPanelContent>
</template>
