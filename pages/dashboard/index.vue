<template>
  <UDashboardPanelContent>
    <div class="p-6 space-y-6">

      <!-- ── Header ────────────────────────────────────────────── -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Store Overview</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ todayFormatted }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            color="gray"
            size="sm"
            :loading="isRefreshing"
            @click="handleRefresh"
          />
          <UButton
            icon="i-heroicons-document-chart-bar"
            variant="soft"
            color="gray"
            size="sm"
            to="/reports/daily"
          >
            Reports
          </UButton>
          <UButton
            icon="i-heroicons-plus"
            color="primary"
            size="sm"
            to="/erp/billing"
          >
            New Bill
          </UButton>
        </div>
      </div>

      <!-- ── KPI Cards ─────────────────────────────────────────── -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

        <UCard :ui="{ body: { padding: 'p-4' }, ring: '' }" class="ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">Revenue</p>
              <p class="mt-1 text-lg font-bold text-gray-900 dark:text-white truncate">{{ formatCompact(totalRevenue) }}</p>
              <p class="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">Paid bills</p>
            </div>
            <div class="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg shrink-0">
              <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: { padding: 'p-4' }, ring: '' }" class="ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">Expenses</p>
              <p class="mt-1 text-lg font-bold text-gray-900 dark:text-white truncate">{{ formatCompact(totalExpenses) }}</p>
              <p class="mt-0.5 text-xs text-red-500 dark:text-red-400">All time</p>
            </div>
            <div class="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg shrink-0">
              <UIcon name="i-heroicons-receipt-percent" class="w-4 h-4 text-red-500 dark:text-red-400" />
            </div>
          </div>
        </UCard>

        <UCard
          :ui="{ body: { padding: 'p-4' }, ring: '' }"
          :class="profit >= 0
            ? 'ring-1 ring-gray-200 dark:ring-gray-800'
            : 'ring-1 ring-red-200 dark:ring-red-800'"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">Profit</p>
              <p
                class="mt-1 text-lg font-bold truncate"
                :class="profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'"
              >
                {{ formatCompact(profit) }}
              </p>
              <p class="mt-0.5 text-xs text-gray-400">Rev − Exp</p>
            </div>
            <div
              class="p-2 rounded-lg shrink-0"
              :class="profit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30'"
            >
              <UIcon
                :name="profit >= 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'"
                class="w-4 h-4"
                :class="profit >= 0 ? 'text-emerald-600' : 'text-red-600'"
              />
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: { padding: 'p-4' }, ring: '' }" class="ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">Outstanding</p>
              <p class="mt-1 text-lg font-bold text-orange-600 dark:text-orange-400 truncate">{{ formatCompact(totalUnpaid) }}</p>
              <p class="mt-0.5 text-xs text-gray-400">{{ unpaidCount }} bill(s)</p>
            </div>
            <div class="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg shrink-0">
              <UIcon name="i-heroicons-clock" class="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: { padding: 'p-4' }, ring: '' }" class="ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">Stock</p>
              <p class="mt-1 text-lg font-bold text-gray-900 dark:text-white truncate">{{ itemsCount }}</p>
              <p
                class="mt-0.5 text-xs"
                :class="lowStockEntries.length > 0 ? 'text-orange-500' : 'text-emerald-500'"
              >
                {{ lowStockEntries.length > 0 ? `${lowStockEntries.length} low stock` : 'All good' }}
              </p>
            </div>
            <div class="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg shrink-0">
              <UIcon name="i-heroicons-cube" class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: { padding: 'p-4' }, ring: '' }" class="ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">Tax</p>
              <p class="mt-1 text-lg font-bold text-gray-900 dark:text-white truncate">{{ formatCompact(totalTaxCollected) }}</p>
              <p class="mt-0.5 text-xs text-gray-400">GST collected</p>
            </div>
            <div class="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg shrink-0">
              <UIcon name="i-heroicons-percent-badge" class="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </UCard>

      </div>

      <!-- ── Low Stock Alert ───────────────────────────────────── -->
      <div
        v-if="lowStockEntries.length > 0"
        class="flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl"
      >
        <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-orange-500 shrink-0" />
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium text-orange-800 dark:text-orange-300">
            {{ lowStockEntries.length }} item(s) running low:
          </span>
          <span class="text-sm text-orange-600 dark:text-orange-400 ml-1">
            {{ lowStockEntries.map(e => e.name || 'Unknown').slice(0, 4).join(', ') }}{{ lowStockEntries.length > 4 ? ` +${lowStockEntries.length - 4} more` : '' }}
          </span>
        </div>
        <UButton size="xs" color="orange" variant="outline" to="/products/stocks" class="shrink-0">
          View Stocks
        </UButton>
      </div>

      <!-- ── Charts Row ────────────────────────────────────────── -->
      <ClientOnly>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <!-- Revenue Bar Chart (2/3) -->
          <UCard
            class="lg:col-span-2"
            :ui="{ ring: '', body: { padding: 'p-4' }, header: { padding: 'px-4 pt-4 pb-0' } }"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Monthly Revenue</h3>
                  <p class="text-xs text-gray-500 mt-0.5">This year · paid bills only</p>
                </div>
                <UBadge color="emerald" variant="soft" size="sm">
                  {{ formatCurrency(thisMonthRevenue) }} this month
                </UBadge>
              </div>
            </template>
            <div v-if="!revenueGraph?.length" class="h-56 flex items-center justify-center text-sm text-gray-400">
              No revenue data yet
            </div>
            <v-chart v-else class="h-56 w-full" :option="revenueChartOption" autoresize />
          </UCard>

          <!-- Category Pie (1/3) -->
          <UCard :ui="{ ring: '', body: { padding: 'p-4' }, header: { padding: 'px-4 pt-4 pb-0' } }">
            <template #header>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Revenue by Category</h3>
                <p class="text-xs text-gray-500 mt-0.5">All time · all bills</p>
              </div>
            </template>
            <div v-if="!revenueByCategory?.length" class="h-56 flex items-center justify-center text-sm text-gray-400">
              No category data yet
            </div>
            <v-chart v-else class="h-56 w-full" :option="pieChartOption" autoresize />
          </UCard>

        </div>

        <!-- Bills Volume Area Chart (full width) -->
        <UCard :ui="{ ring: '', body: { padding: 'p-4' }, header: { padding: 'px-4 pt-4 pb-0' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Bills Volume</h3>
                <p class="text-xs text-gray-500 mt-0.5">Monthly total value · all payment statuses</p>
              </div>
              <UBadge color="indigo" variant="soft" size="sm">
                {{ thisMonthBillsCount }} bills this month
              </UBadge>
            </div>
          </template>
          <v-chart class="h-40 w-full" :option="billsChartOption" autoresize />
        </UCard>

      </ClientOnly>

      <!-- ── Tables Row ────────────────────────────────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Recent Bills Table -->
        <UCard :ui="{ ring: '', body: { padding: 'p-0' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
              <UButton size="xs" variant="ghost" color="gray" to="/erp/sales" trailing-icon="i-heroicons-arrow-right">
                View all
              </UButton>
            </div>
          </template>
          <UTable
            :rows="recentTransactions"
            :columns="billColumns"
            :ui="{
              th: { base: 'text-xs' },
              td: { base: 'text-sm' }
            }"
          >
            <template #id-data="{ row }">
              <span class="font-mono text-xs text-gray-400">#{{ row.id.slice(0, 8) }}</span>
            </template>
            <template #grandTotal-data="{ row }">
              <span class="font-semibold text-gray-900 dark:text-white">{{ formatCurrency(row.grandTotal ?? 0) }}</span>
            </template>
            <template #paymentStatus-data="{ row }">
              <UBadge
                :color="row.paymentStatus === 'PAID' ? 'emerald' : row.paymentStatus === 'PENDING' ? 'orange' : 'blue'"
                variant="soft"
                size="xs"
              >
                {{ row.paymentStatus }}
              </UBadge>
            </template>
            <template #createdAt-data="{ row }">
              <span class="text-xs text-gray-400">{{ formatDate(row.createdAt) }}</span>
            </template>
          </UTable>
          <div v-if="!recentTransactions.length" class="py-8 text-center text-sm text-gray-400">
            No bills yet
          </div>
        </UCard>

        <!-- Top Products with Progress Bars -->
        <UCard :ui="{ ring: '', body: { padding: 'p-4' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">Top Products by Units Sold</h3>
              <UButton size="xs" variant="ghost" color="gray" to="/products" trailing-icon="i-heroicons-arrow-right">
                View all
              </UButton>
            </div>
          </template>
          <div v-if="!topProducts.length" class="py-8 text-center text-sm text-gray-400">
            No sales data yet
          </div>
          <div v-else class="space-y-3.5">
            <div v-for="(product, i) in topProducts" :key="product.name" class="space-y-1.5">
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-xs font-bold text-gray-300 dark:text-gray-600 w-4 shrink-0">{{ i + 1 }}</span>
                  <span class="font-medium text-gray-800 dark:text-gray-100 truncate">{{ product.name }}</span>
                </div>
                <span class="text-xs text-gray-500 shrink-0 ml-2">{{ product.total }} units</span>
              </div>
              <UProgress
                :value="Math.round((product.total / (topProducts[0]?.total || 1)) * 100)"
                :color="i === 0 ? 'emerald' : i === 1 ? 'indigo' : 'gray'"
                size="xs"
              />
            </div>
          </div>
        </UCard>

      </div>

      <!-- ── Bottom Row ─────────────────────────────────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        <!-- Low Stock Items -->
        <UCard :ui="{ ring: '', body: { padding: 'p-0' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-orange-500" />
                Low Stock
              </h3>
              <UBadge v-if="lowStockEntries.length" color="orange" variant="soft" size="xs">
                {{ lowStockEntries.length }}
              </UBadge>
            </div>
          </template>
          <div v-if="!lowStockEntries.length" class="py-8 flex flex-col items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-heroicons-check-circle" class="w-7 h-7" />
            All items in stock
          </div>
          <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
            <li
              v-for="entry in lowStockEntries"
              :key="entry.id"
              class="flex items-center justify-between px-4 py-2.5"
            >
              <span class="text-sm text-gray-700 dark:text-gray-200 truncate pr-2">{{ entry.name || 'Unknown' }}</span>
              <UBadge
                :color="(entry.qty ?? 0) === 0 ? 'red' : 'orange'"
                variant="soft"
                size="xs"
                class="shrink-0"
              >
                {{ entry.qty ?? 0 }} left
              </UBadge>
            </li>
          </ul>
        </UCard>

        <!-- Outstanding Customers -->
        <UCard :ui="{ ring: '', body: { padding: 'p-0' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">Outstanding Customers</h3>
              <UBadge v-if="totalUnpaid > 0" color="red" variant="soft" size="xs">
                {{ formatCompact(totalUnpaid) }}
              </UBadge>
            </div>
          </template>
          <div v-if="!outstandingCustomers.length" class="py-8 text-center text-sm text-gray-400">
            No outstanding payments
          </div>
          <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
            <li
              v-for="customer in outstandingCustomers.slice(0, 6)"
              :key="customer.name"
              class="flex items-center justify-between px-4 py-2.5"
            >
              <div class="min-w-0 pr-2">
                <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ customer.name }}</p>
                <p class="text-xs text-gray-400">{{ customer.count }} bill(s)</p>
              </div>
              <span class="text-sm font-semibold text-red-600 dark:text-red-400 shrink-0">
                {{ formatCurrency(customer.total) }}
              </span>
            </li>
          </ul>
        </UCard>

        <!-- This Month Summary -->
        <UCard :ui="{ ring: '', body: { padding: 'p-4' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">This Month</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ currentMonthLabel }}</p>
            </div>
          </template>
          <div class="space-y-3">

            <div class="flex items-center justify-between py-1">
              <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div class="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">
                  <UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span>Bills</span>
              </div>
              <span class="font-semibold text-gray-900 dark:text-white">{{ thisMonthBillsCount }}</span>
            </div>

            <UDivider />

            <div class="flex items-center justify-between py-1">
              <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div class="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 rounded">
                  <UIcon name="i-heroicons-currency-rupee" class="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span>Revenue</span>
              </div>
              <span class="font-semibold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(thisMonthRevenue) }}</span>
            </div>

            <UDivider />

            <div class="flex items-center justify-between py-1">
              <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div class="p-1.5 bg-purple-50 dark:bg-purple-900/30 rounded">
                  <UIcon name="i-heroicons-cube" class="w-3.5 h-3.5 text-purple-500" />
                </div>
                <span>Products</span>
              </div>
              <span class="font-semibold text-gray-900 dark:text-white">{{ productsCount }}</span>
            </div>

            <UDivider />

            <div class="flex items-center justify-between py-1">
              <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div class="p-1.5 bg-orange-50 dark:bg-orange-900/30 rounded">
                  <UIcon name="i-heroicons-user-group" class="w-3.5 h-3.5 text-orange-500" />
                </div>
                <span>Outstanding clients</span>
              </div>
              <span class="font-semibold text-gray-900 dark:text-white">{{ outstandingCustomers.length }}</span>
            </div>

          </div>
        </UCard>

      </div>
    </div>
  </UDashboardPanelContent>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useCompanyDashboard } from '@/lib/api/useDashboardData'

onMounted(() => {
  useEChartsSetup()
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VChart = defineAsyncComponent({
  loader: () => import('vue-echarts'),
  suspensible: false,
  // @ts-ignore
  ssr: false,
})

const {
  productsCount,
  itemsCount,
  totalRevenue,
  totalExpenses,
  revenueGraph,
  topProducts,
  lowStockEntries,
  recentTransactions,
  revenueByCategory,
  billsOverTime,
  totalUnpaid,
  totalTaxCollected,
  outstandingCustomers,
  bills,
  refreshAll,
} = useCompanyDashboard()

// ── State ──────────────────────────────────────────────────────
const isRefreshing = ref(false)

const handleRefresh = async () => {
  isRefreshing.value = true
  await refreshAll()
  isRefreshing.value = false
}

// ── Derived ────────────────────────────────────────────────────
const profit = computed(() => totalRevenue.value - totalExpenses.value)
const unpaidCount = computed(() => bills.value?.filter(b => b.paymentStatus !== 'PAID').length ?? 0)

const today = new Date()
const thisMonth = today.getMonth() + 1

const todayFormatted = today.toLocaleDateString('en-IN', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})

const currentMonthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

const thisMonthBillsCount = computed(() =>
  bills.value?.filter(b => new Date(b.createdAt).getMonth() + 1 === thisMonth).length ?? 0
)

const thisMonthRevenue = computed(() =>
  bills.value
    ?.filter(b => new Date(b.createdAt).getMonth() + 1 === thisMonth && b.paymentStatus === 'PAID')
    .reduce((sum, b) => sum + (b.grandTotal ?? 0), 0) ?? 0
)

// ── Formatters ─────────────────────────────────────────────────
const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)

const formatCompact = (val: number) => {
  if (val >= 10_00_000) return `₹${(val / 10_00_000).toFixed(1)}L`
  if (val >= 1_000) return `₹${(val / 1_000).toFixed(1)}K`
  return `₹${val}`
}

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })

// ── Table columns ──────────────────────────────────────────────
const billColumns = [
  { key: 'id', label: 'Bill #' },
  { key: 'grandTotal', label: 'Amount' },
  { key: 'paymentStatus', label: 'Status' },
  { key: 'createdAt', label: 'Date' },
]

// ── Chart palette ──────────────────────────────────────────────
const PIE_COLORS = [
  '#10b981', '#6366f1', '#f59e0b', '#ef4444',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
]

// ── ECharts options ────────────────────────────────────────────
const revenueChartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: (params: any[]) =>
      `<b>${params[0].name}</b><br/>₹${(params[0].value ?? 0).toLocaleString('en-IN')}`,
  },
  grid: { left: '2%', right: '2%', bottom: '3%', top: '8%', containLabel: true },
  xAxis: {
    type: 'category',
    data: revenueGraph.value?.map(d => d.month) ?? [],
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 11 },
  },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: (v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`, fontSize: 11 },
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
  },
  series: [{
    name: 'Revenue',
    type: 'bar',
    data: revenueGraph.value?.map(d => d.total) ?? [],
    itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
    emphasis: { itemStyle: { color: '#059669' } },
    barMaxWidth: 36,
  }],
}))

const pieChartOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: any) => `${p.name}<br/>₹${(p.value ?? 0).toLocaleString('en-IN')} (${p.percent}%)`,
  },
  legend: {
    orient: 'horizontal',
    bottom: 0,
    textStyle: { fontSize: 10 },
    itemWidth: 10,
    itemHeight: 10,
  },
  color: PIE_COLORS,
  series: [{
    type: 'pie',
    radius: ['38%', '65%'],
    center: ['50%', '44%'],
    data: revenueByCategory.value?.map(c => ({
      name: c.name,
      value: Math.round(c.value),
    })) ?? [],
    emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.15)' } },
    label: { show: false },
    labelLine: { show: false },
  }],
}))

const billsChartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: (params: any[]) =>
      `<b>${params[0].name}</b><br/>₹${(params[0].value ?? 0).toLocaleString('en-IN')}`,
  },
  grid: { left: '2%', right: '2%', bottom: '3%', top: '5%', containLabel: true },
  xAxis: {
    type: 'category',
    data: billsOverTime.value?.map(d => d.month) ?? [],
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 11 },
    boundaryGap: false,
  },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: (v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`, fontSize: 11 },
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
  },
  series: [{
    name: 'Volume',
    type: 'line',
    smooth: true,
    data: billsOverTime.value?.map(d => d.total) ?? [],
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(99,102,241,0.25)' },
          { offset: 1, color: 'rgba(99,102,241,0.02)' },
        ],
      },
    },
    lineStyle: { color: '#6366f1', width: 2.5 },
    itemStyle: { color: '#6366f1' },
    symbol: 'circle',
    symbolSize: 5,
  }],
}))
</script>
