<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { format, sub, isSameDay, type Duration, startOfDay, endOfDay } from 'date-fns'

const toast = useToast()

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

const { data, pending, error, refresh } = await useFetch('/api/accounts/taxledger', {
  query: computed(() => ({
    from: startOfDay(selectedDate.value.start).toISOString(),
    to: endOfDay(selectedDate.value.end).toISOString(),
  })),
  immediate: true,
  watch: false,
})

watch(error, e => {
  if (e) {
    toast.add({
      title: 'Failed to load tax account',
      description: e.message,
      color: 'red',
    })
  }
})

const summary = computed(() => data.value?.summary ?? {
  billCount: 0,
  taxableValue: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  totalTax: 0,
  invoiceValue: 0,
})
const ledger = computed(() => data.value?.ledger ?? [])
const rateSummary = computed(() => data.value?.rateSummary ?? [])
const closingBalance = computed(() => data.value?.closingBalance ?? 0)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(v ?? 0)

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Bill' },
  { key: 'taxableValue', label: 'Taxable' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'taxAmount', label: 'Tax' },
  { key: 'invoiceTotal', label: 'Invoice' },
  { key: 'runningBalance', label: 'Balance' },
]

const rateColumns = [
  { key: 'taxRate', label: 'Rate' },
  { key: 'taxableValue', label: 'Taxable' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'totalTax', label: 'Tax' },
]
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="mb-4 flex flex-col gap-1">
      <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Tax Account</h1>
      <p class="text-sm text-gray-500">Bill-wise tax collected for the selected period.</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
      <UCard>
        <div class="text-sm text-gray-500">Taxable Value</div>
        <div class="text-xl font-semibold">{{ formatCurrency(summary.taxableValue) }}</div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">CGST</div>
        <div class="text-xl font-semibold text-green-600">{{ formatCurrency(summary.cgst) }}</div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">SGST</div>
        <div class="text-xl font-semibold text-green-600">{{ formatCurrency(summary.sgst) }}</div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">Total Tax</div>
        <div class="text-xl font-semibold text-green-600">{{ formatCurrency(summary.totalTax) }}</div>
      </UCard>
    </div>

    <UCard
      class="w-full"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '' },
        footer: { padding: 'p-4' },
      }"
    >
      <template #header>
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <UPopover :popper="{ placement: 'bottom-start' }">
            <UButton icon="i-heroicons-calendar-days-20-solid" class="w-full sm:w-64">
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

          <div class="text-sm text-gray-500">
            {{ summary.billCount }} bills · {{ formatCurrency(summary.invoiceValue) }} invoice value
          </div>
        </div>
      </template>

      <UTable
        :rows="ledger"
        :loading="pending"
        :columns="columns"
      >
        <template #date-data="{ row }">
          {{ format(new Date(row.date), 'dd MMM yyyy') }}
        </template>

        <template #description-data="{ row }">
          <NuxtLink :to="`/erp/sales/${row.ref}`" class="text-primary hover:underline">
            {{ row.description }}
          </NuxtLink>
        </template>

        <template #taxableValue-data="{ row }">
          {{ formatCurrency(row.taxableValue) }}
        </template>

        <template #cgst-data="{ row }">
          {{ formatCurrency(row.cgst) }}
        </template>

        <template #sgst-data="{ row }">
          {{ formatCurrency(row.sgst) }}
        </template>

        <template #taxAmount-data="{ row }">
          <span class="font-medium text-green-600">{{ formatCurrency(row.taxAmount) }}</span>
        </template>

        <template #invoiceTotal-data="{ row }">
          {{ formatCurrency(row.invoiceTotal) }}
        </template>

        <template #runningBalance-data="{ row }">
          {{ formatCurrency(row.runningBalance) }}
        </template>
      </UTable>

      <template #footer>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-500">Tax Closing Balance</span>
          <span class="text-xl font-semibold">{{ formatCurrency(closingBalance) }}</span>
        </div>
      </template>
    </UCard>

    <UCard
      class="w-full mt-4"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-4' },
        body: { padding: '' },
      }"
    >
      <template #header>
        <h2 class="font-semibold text-sm">Rate Summary</h2>
      </template>

      <UTable
        :rows="rateSummary"
        :loading="pending"
        :columns="rateColumns"
      >
        <template #taxRate-data="{ row }">
          {{ row.taxRate }}%
        </template>

        <template #taxableValue-data="{ row }">
          {{ formatCurrency(row.taxableValue) }}
        </template>

        <template #cgst-data="{ row }">
          {{ formatCurrency(row.cgst) }}
        </template>

        <template #sgst-data="{ row }">
          {{ formatCurrency(row.sgst) }}
        </template>

        <template #totalTax-data="{ row }">
          <span class="font-medium text-green-600">{{ formatCurrency(row.totalTax) }}</span>
        </template>
      </UTable>
    </UCard>
  </UDashboardPanelContent>
</template>
