<script setup lang="ts">
import { format, startOfDay, endOfDay, sub, isSameDay, type Duration } from 'date-fns'
import PullToRefresh from 'pulltorefreshjs'
import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'

const useAuth = () => useNuxtApp().$auth
const scrollContainer = ref<HTMLElement | null>(null)
const loading = ref(false)
const toast = useToast()

const selectedDate = ref({ start: new Date(), end: new Date() })

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } },
]

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
}
function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const report = ref<{
  totalSales: number
  totalCommission: number
  billCount: number
  salesByPaymentMethod: Record<string, number>
  revenueByCategory: { name: string; value: number }[]
  categorySales: { name: string; sales: number }[]
} | null>(null)

const totalBalance = computed(() =>
  (report.value?.totalSales ?? 0) - (report.value?.totalCommission ?? 0)
)

const fetchReport = async () => {
  loading.value = true
  try {
    report.value = await $fetch('/api/report/online', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start),
        endDate: endOfDay(selectedDate.value.end),
      },
    })
  } catch {
    toast.add({ title: 'Failed to load report', color: 'red' })
  } finally {
    loading.value = false
  }
}

watch(selectedDate, fetchReport, { deep: true })

onMounted(async () => {
  await fetchReport()
  await nextTick()
  if (scrollContainer.value) {
    PullToRefresh.init({ mainElement: scrollContainer.value, onRefresh: fetchReport })
  }
})

onUnmounted(() => PullToRefresh.destroyAll())

const formatCurrency = (val: number) =>
  '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const kpiCards = computed(() => [
  {
    title: 'Total Online Sales',
    value: formatCurrency(report.value?.totalSales ?? 0),
    icon: 'i-heroicons-banknotes',
    sub: `${report.value?.billCount ?? 0} bills paid`,
    accent: 'border-l-primary-500',
    textColor: 'text-primary-600 dark:text-primary-400',
  },
  {
    title: 'Total Bills',
    value: report.value?.billCount ?? 0,
    icon: 'i-heroicons-document-text',
    sub: 'Markit orders',
    accent: 'border-l-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Total Commission',
    value: formatCurrency(report.value?.totalCommission ?? 0),
    icon: 'i-heroicons-receipt-percent',
    sub: 'Payable to Markit',
    accent: 'border-l-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    title: 'Balance After Commission',
    value: formatCurrency(totalBalance.value),
    icon: 'i-heroicons-currency-rupee',
    sub: 'Net earnings',
    accent: 'border-l-green-500',
    textColor: 'text-green-600 dark:text-green-400',
  },
])

const categoryColumns = [
  { key: 'name', label: 'Category' },
  { key: 'salesFormatted', label: 'Revenue' },
  { key: 'pct', label: 'Share' },
]

const categoryRows = computed(() => {
  const rows = report.value?.categorySales ?? []
  const total = rows.reduce((s, r) => s + r.sales, 0)
  return rows.map(r => ({
    name: r.name,
    salesFormatted: formatCurrency(r.sales),
    pct: total > 0 ? ((r.sales / total) * 100).toFixed(1) + '%' : '0%',
  }))
})

</script>

<template>
  <UDashboardPanelContent>
    <div ref="scrollContainer" class="scroll-container">
      <div class="space-y-6 p-4 md:p-6">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 class="text-xl font-semibold">Markit Online Sales</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Orders placed via the Markit marketplace
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UPopover :popper="{ placement: 'bottom-end' }" class="z-10">
              <UButton icon="i-heroicons-calendar-days-20-solid" color="gray" variant="outline">
                {{ format(selectedDate.start, 'd MMM, yyyy') }} — {{ format(selectedDate.end, 'd MMM, yyyy') }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton
                      v-for="(range, i) in ranges"
                      :key="i"
                      :label="range.label"
                      color="gray"
                      variant="ghost"
                      class="rounded-none px-6"
                      :class="isRangeSelected(range.duration)
                        ? 'bg-gray-100 dark:bg-gray-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                      truncate
                      @click="selectRange(range.duration)"
                    />
                  </div>
                  <DatePicker v-model="selectedDate" @close="close" />
                </div>
              </template>
            </UPopover>
            <UButton
              icon="i-heroicons-arrow-path"
              color="gray"
              variant="outline"
              :loading="loading"
              @click="fetchReport"
            />
          </div>
        </div>

        <!-- KPI Cards skeleton -->
        <div v-if="loading" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <USkeleton v-for="i in 4" :key="i" class="h-28 rounded-xl" />
        </div>

        <!-- KPI Cards -->
        <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            v-for="card in kpiCards"
            :key="card.title"
            class="rounded-xl border-l-4 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-1"
            :class="card.accent"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none">
                {{ card.title }}
              </span>
              <UIcon :name="card.icon" class="w-4 h-4 text-gray-300 dark:text-gray-600" />
            </div>
            <span class="text-2xl font-bold truncate" :class="card.textColor">{{ card.value }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500">{{ card.sub }}</span>
          </div>
        </div>

<!-- Table + Chart -->
        <div v-if="!loading && report?.billCount" class="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <!-- Category Table -->
          <UCard :ui="{ body: { padding: '' }, header: { padding: 'px-4 py-3' } }">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-400" />
                <span class="text-sm font-semibold">Revenue by Category</span>
              </div>
            </template>
            <UTable :rows="categoryRows" :columns="categoryColumns" />
          </UCard>

          <!-- Pie Chart -->
          <UCard :ui="{ header: { padding: 'px-4 py-3' } }">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-gray-400" />
                <span class="text-sm font-semibold">Category Distribution</span>
              </div>
            </template>
            <CategoryRevenuePie
              v-if="report?.revenueByCategory?.length"
              :revenueByCategory="report.revenueByCategory"
              title="Category"
            />
          </UCard>

        </div>

        <!-- Empty state -->
        <div
          v-if="!loading && !report?.billCount"
          class="flex flex-col items-center justify-center py-20 text-gray-400 gap-3"
        >
          <UIcon name="i-heroicons-shopping-bag" class="w-12 h-12 opacity-40" />
          <span class="text-sm">No Markit orders in this date range</span>
        </div>

      </div>
    </div>
  </UDashboardPanelContent>
</template>
