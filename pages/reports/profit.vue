<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { format, startOfDay, endOfDay, isSameDay, endOfMonth, sub } from 'date-fns'
import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'
/* -----------------------------
  STATE
------------------------------ */
const loading = ref(true)
const report = ref<any>(null)

/* UTable expand state */
const expand = ref({
  openedRows: [],
  row: null
})

const selectedDate = ref({ 
    start: new Date() , 
    end: new Date() 
});

/* -----------------------------
  QUICK RANGES
------------------------------ */
const quickRanges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

const applyQuickRange = (fn: Function, close: Function) => {
  selectedDate.value = fn()
  close()
}

/* -----------------------------
  FETCH
------------------------------ */
const fetchReport = async () => {
  loading.value = true
  report.value = await $fetch('/api/report/profit', {
   query: {
    startDate: startOfDay(selectedDate.value.start).toISOString(),
    endDate: endOfDay(selectedDate.value.end).toISOString()
  }
  })
  loading.value = false
}

onMounted(fetchReport)
watch(selectedDate, fetchReport)

/* -----------------------------
  TABLE CONFIG
------------------------------ */
const columns = [
  { key: 'billDate', label: 'Date' },
  { key: 'invoiceNumber', label: 'Invoice' },
  { key: 'billSales', label: 'Sales' },
  { key: 'billCOGS', label: 'COGS' },
  { key: 'billProfit', label: 'Profit' },
  { key: 'marginPercent', label: 'Margin %' }
]

const entryColumns = [
  { key: 'slNo', label: '#' },
  { key: 'name', label: 'Item' },
  { key: 'qty', label: 'Qty' },
  { key: 'rate', label: 'Rate' },
  { key: 'value', label: 'Value' },
  { key: 'cogs', label: 'COGS' },
  { key: 'profit', label: 'Profit' },
  { key: 'marginPercent', label: 'Margin %' }
]

const categoryColumns = [
  { key: 'name', label: 'Category' },
  { key: 'sales', label: 'Sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'marginPercent', label: 'Margin %' }
]



function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}


/* -----------------------------
  HELPERS
------------------------------ */
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(v ?? 0)
</script>

<template>
  <UDashboardPanelContent>
      <div v-if="loading" class="w-full flex justify-center items-center py-20">
      <UIcon
        name="i-heroicons-arrow-path-20-solid"
        class="animate-spin w-5 h-5 text-gray-500 mr-2"
      />
      <span>Loading data...</span>
    </div>
    <div v-else class="p-6 space-y-6">

      <!-- HEADER -->
      <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <!-- DATE PICKER -->
        <UPopover :popper="{ placement: 'bottom-start' }">
          <UButton
            icon="i-heroicons-calendar-days-20-solid"
            class="w-full sm:w-64 justify-start"
          >
            {{ format(selectedDate.start, 'dd MMM yyyy') }}
            —
            {{ format(selectedDate.end, 'dd MMM yyyy') }}
          </UButton>

          <template #panel="{ close }">
            <div class="flex divide-x divide-gray-200 dark:divide-gray-800">
              <div class="w-48 p-2 space-y-1">
                <UButton
                    v-for="(range, index) in quickRanges"
                    :key="index"
                    :label="range.label"
                    color="gray"
                    variant="ghost"
                    class="rounded-none px-6 w-full sm:w-auto"
                    :class="[
                      isRangeSelected(range.duration)
                        ? 'bg-gray-100 dark:bg-gray-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    ]"
                    truncate
                    @click="selectRange(range.duration)"
                  />
              </div>

              <div class="p-2">
                <DatePicker
                  v-model="selectedDate"
                  range
                  @update:model-value="close"
                />
              </div>
            </div>
          </template>
        </UPopover>
      </div>

      <!-- SUMMARY -->
      <div v-if="report" class="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <UCard>
          <div class="text-sm text-gray-500">Total Sales</div>
          <div class="text-xl font-semibold">
            {{ formatCurrency(report.summary.totalSales) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-500">Total COGS</div>
          <div class="text-xl font-semibold">
            {{ formatCurrency(report.summary.totalCOGS) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-500">Profit</div>
          <div class="text-xl font-semibold text-green-600">
            {{ formatCurrency(report.summary.totalProfitBeforeExpense) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-500">Expenses</div>
          <div class="text-xl font-semibold text-red-500">
            {{ formatCurrency(report.summary.totalExpenses) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-500">Net Profit</div>
          <div
            class="text-xl font-semibold"
            :class="report.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'"
          >
            {{ formatCurrency(report.summary.netProfit) }}
          </div>
        </UCard>
      </div>

      <!-- TABLE -->
        <UCard
            class="w-full h-[400px] overflow-y-scroll"
            :ui="{
                base: '',
                
                divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                header: { padding: 'px-4 py-5' },
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-700',
                },
                footer: { padding: 'p-4' },
            }"
        >
      <UTable
        v-if="report"
        v-model:expand="expand"
        :rows="report.bills"
        :columns="columns"
        :loading="loading"
        :multiple-expand="false"
      >
        <template #billDate-data="{ row }">
          {{ format(new Date(row.billDate), 'dd MMM yyyy') }}
        </template>

        <template #billSales-data="{ row }">
          {{ formatCurrency(row.billSales) }}
        </template>

        <template #billCOGS-data="{ row }">
          {{ formatCurrency(row.billCOGS) }}
        </template>

        <template #billProfit-data="{ row }">
          <span :class="row.billProfit >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ formatCurrency(row.billProfit) }}
          </span>
        </template>

        <template #marginPercent-data="{ row }">
          {{ row.marginPercent.toFixed(2) }}%
        </template>

        <!-- EXPANDED ROW -->
        <template #expand="{ row }">
          <UTable
            :rows="row.entries"
            :columns="entryColumns"
            class="text-xs"
          >
            <template #rate-data="{ row }">
              {{ formatCurrency(row.rate) }}
            </template>
            <template #value-data="{ row }">
              {{ formatCurrency(row.value) }}
            </template>
            <template #cogs-data="{ row }">
              {{ formatCurrency(row.cogs) }}
            </template>
            <template #profit-data="{ row }">
              <span :class="row.profit >= 0 ? 'text-green-600' : 'text-red-600'">
                {{ formatCurrency(row.profit) }}
              </span>
            </template>
            <template #marginPercent-data="{ row }">
              {{ row.marginPercent.toFixed(2) }}%
            </template>
          </UTable>
        </template>
      </UTable>
    </UCard>
    <!-- CATEGORY WISE PROFIT TABLE -->
     <div class="flex flex-col lg:flex-row gap-4 lg:h-[400px]">
<UCard
  class="w-full flex-1 lg:overflow-y-scroll"
  :ui="{
    base: '',
    divide: 'divide-y divide-gray-200 dark:divide-gray-700',
    header: { padding: 'px-4 py-4' },
    body: { padding: '' }
  }"
>

  <UTable
    :rows="report.categoryProfit"
    :columns="categoryColumns"
  >
    <template #sales-data="{ row }">
      {{ formatCurrency(row.sales) }}
    </template>

    <template #profit-data="{ row }">
      <span :class="row.profit >= 0 ? 'text-green-600' : 'text-red-600'">
        {{ formatCurrency(row.profit) }}
      </span>
    </template>

    <template #marginPercent-data="{ row }">
      {{ row.marginPercent.toFixed(2) }}%
    </template>
  </UTable>
</UCard>
<UCard class="flex-1">
    <CategoryRevenuePie
      :revenueByCategory="report.categoryProfitChart"
      title="Category"
    />
  </UCard>
</div>  
    </div>
  </UDashboardPanelContent>
</template>
