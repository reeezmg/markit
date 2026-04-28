<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { endOfDay, format, isSameDay, startOfDay, sub, type Duration } from 'date-fns'
import type { SummaryResponse } from '~/server/utils/reportSummary'
import { useEChartsSetup } from '~/composables/useEChartsSetup'

definePageMeta({
  middleware: 'admin',
})

const VChart = defineAsyncComponent(() => import('vue-echarts'))

const loading = ref(true)
const pdfLoading = ref(false)
const includeAiInsights = ref(true)
const summary = ref<SummaryResponse | null>(null)
const toast = useToast()

const selectedDate = ref({
  start: sub(new Date(), { days: 29 }),
  end: new Date(),
})

const quickRanges: Array<{ label: string; duration: Duration }> = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } },
]

onMounted(() => {
  useEChartsSetup()
  fetchSummary()
})

watch(selectedDate, () => {
  fetchSummary()
})

async function fetchSummary() {
  loading.value = true

  try {
    summary.value = await $fetch('/api/report/summary', {
      query: {
        from: startOfDay(selectedDate.value.start).toISOString(),
        to: endOfDay(selectedDate.value.end).toISOString(),
      },
    })
  } catch (error) {
    toast.add({
      title: 'Summary failed',
      description: 'Could not load the business summary.',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

async function downloadPdf() {
  pdfLoading.value = true

  try {
    const response = await $fetch.raw('/api/report/generate-summary.pdf', {
      method: 'GET',
      params: {
        from: startOfDay(selectedDate.value.start).toISOString(),
        to: endOfDay(selectedDate.value.end).toISOString(),
        ai: includeAiInsights.value ? 'true' : 'false',
      },
      headers: { Accept: 'application/pdf' },
    })

    const blob = new Blob([response._data as unknown as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const disposition = response.headers.get('content-disposition')
    const filename = disposition?.match(/filename="(.+)"/)?.[1] || 'business-summary.pdf'

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({
      title: 'PDF failed',
      description: 'Could not generate the summary PDF.',
      color: 'red',
    })
  } finally {
    pdfLoading.value = false
  }
}

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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)

const formatPercent = (value: number) => `${Number(value || 0).toFixed(2)}%`

const topCategoryRows = computed(() => summary.value?.sales.topCategories || [])
const expenseCategoryRows = computed(() => summary.value?.expenses.byCategory || [])
const pendingCreditRows = computed(() => summary.value?.pendingCreditBills || [])
const pendingCreditTotal = computed(() =>
  pendingCreditRows.value.reduce((sum, bill) => sum + (bill.grandTotal || 0), 0)
)

const kpiCards = computed(() => {
  if (!summary.value) return []

  return [
    {
      label: 'Opening Balance',
      value: formatCurrency(summary.value.balances.total.opening),
      tone: 'text-slate-900 dark:text-white',
      meta: `Cash ${formatCurrency(summary.value.balances.cash.opening)} · Bank ${formatCurrency(summary.value.balances.bank.opening)}`,
    },
    {
      label: 'Total Sales',
      value: formatCurrency(summary.value.sales.total),
      tone: 'text-slate-900 dark:text-white',
      meta: `${formatCurrency(summary.value.sales.discount)} discount`,
    },
    {
      label: 'Tax Collected',
      value: formatCurrency(summary.value.sales.tax),
      tone: 'text-slate-900 dark:text-white',
      meta: summary.value.sales.total > 0
        ? `${formatPercent((summary.value.sales.tax / summary.value.sales.total) * 100)} of sales`
        : 'No collected tax in window',
    },
    {
      label: 'Net Profit',
      value: formatCurrency(summary.value.profit.netProfit),
      tone: summary.value.profit.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600',
      meta: `${formatPercent(summary.value.profit.marginPct)} margin`,
    },
    {
      label: 'Total Expense',
      value: formatCurrency(summary.value.expenses.total),
      tone: 'text-slate-900 dark:text-white',
      meta: expenseCategoryRows.value[0]?.name || 'No category split',
    },
     {
      label: 'Closing Balance',
      value: formatCurrency(summary.value.balances.total.closing),
      tone: 'text-slate-900 dark:text-white',
      meta: `Cash ${formatCurrency(summary.value.balances.cash.closing)} · Bank ${formatCurrency(summary.value.balances.bank.closing)}`,
    },
  ]
})

const paymentRows = computed(() => {
  if (!summary.value) return []
  return [
    { mode: 'Cash', amount: summary.value.sales.byPaymentMethod.Cash },
    { mode: 'UPI', amount: summary.value.sales.byPaymentMethod.UPI },
    { mode: 'Card', amount: summary.value.sales.byPaymentMethod.Card },
    { mode: 'Credit', amount: summary.value.sales.byPaymentMethod.Credit },
  ]
})

const expenseModeRows = computed(() => {
  if (!summary.value) return []
  return [
    { mode: 'CASH', amount: summary.value.expenses.byPaymentMode.CASH },
    { mode: 'UPI', amount: summary.value.expenses.byPaymentMode.UPI },
    { mode: 'CARD', amount: summary.value.expenses.byPaymentMode.CARD },
    { mode: 'BANK', amount: summary.value.expenses.byPaymentMode.BANK },
    { mode: 'CHEQUE', amount: summary.value.expenses.byPaymentMode.CHEQUE },
  ]
})

const distributorRows = computed(() => {
  if (!summary.value) return { owe: [], receive: [] }
  return {
    owe: summary.value.distributors.weOwe,
    receive: summary.value.distributors.owedToUs,
  }
})

const moneyInRows = computed(() => {
  if (!summary.value) return []
  return Object.entries(summary.value.moneyTransactions.in.byParty).map(([party, amount]) => ({ party, amount }))
})

const moneyOutRows = computed(() => {
  if (!summary.value) return []
  return Object.entries(summary.value.moneyTransactions.out.byParty).map(([party, amount]) => ({ party, amount }))
})

// ─── Cash flow rows ──────────────────────────────────────────
const cashFlowRows = computed(() => {
  if (!summary.value) return { inflows: [], outflows: [], net: 0, inflowsTotal: 0, outflowsTotal: 0 }
  const cf = summary.value.cashFlow
  const inMax = Math.max(cf.inflows.total, cf.outflows.total, 1)
  return {
    inflows: [
      { label: 'Sales', amount: cf.inflows.sales },
      { label: 'Money received', amount: cf.inflows.moneyReceived },
      { label: 'Investments in', amount: cf.inflows.investmentsIn },
    ].map(r => ({ ...r, share: r.amount / inMax })),
    outflows: [
      { label: 'Expenses', amount: cf.outflows.expenses },
      { label: 'Distributor payments', amount: cf.outflows.distributorPayments },
      { label: 'Money given', amount: cf.outflows.moneyGiven },
      { label: 'Investments out', amount: cf.outflows.investmentsOut },
    ].map(r => ({ ...r, share: r.amount / inMax })),
    net: cf.netChange,
    inflowsTotal: cf.inflows.total,
    outflowsTotal: cf.outflows.total,
  }
})

// ─── P&L analytical ratios ───────────────────────────────────
const pnlRatios = computed(() => {
  if (!summary.value) return null
  const p = summary.value.profit
  const sales = p.totalSales || 0
  const safe = (n: number) => (sales > 0 ? n / sales : 0)
  const grossMarginPct = safe(p.netProfitBeforeExpense) * 100
  const cogsPct = safe(p.totalCOGS) * 100
  const expensePct = safe(p.totalExpenses) * 100
  const netPct = safe(p.netProfit) * 100
  // Breakeven sales = totalExpenses / gross-margin-ratio
  const grossMarginRatio = sales > 0 ? p.netProfitBeforeExpense / sales : 0
  const breakeven = grossMarginRatio > 0 ? p.totalExpenses / grossMarginRatio : 0
  return { grossMarginPct, cogsPct, expensePct, netPct, breakeven }
})

// ─── Trend & forecast statistics (linear regression on profit) ─
const trendStats = computed(() => {
  if (!summary.value) return null
  const series = summary.value.timeSeries
  const n = series.length
  if (n < 2) {
    return { slope: 0, r2: 0, volatility: 0, best: null as null | { date: string; profit: number }, worst: null as null | { date: string; profit: number }, avg: 0 }
  }

  const ys = series.map(p => p.profit)
  const xs = series.map((_, i) => i)
  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n

  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const slope = denX === 0 ? 0 : num / denX
  const r = denX === 0 || denY === 0 ? 0 : num / Math.sqrt(denX * denY)
  const r2 = r * r
  const variance = ys.reduce((s, v) => s + (v - meanY) * (v - meanY), 0) / n
  const volatility = Math.sqrt(variance)

  let best = series[0]
  let worst = series[0]
  for (const point of series) {
    if (point.profit > best.profit) best = point
    if (point.profit < worst.profit) worst = point
  }

  return { slope, r2, volatility, best, worst, avg: meanY }
})

const chartOptions = computed(() => {
  if (!summary.value) return {}

  const actual = summary.value.timeSeries
  const forecast = summary.value.forecast
  const labels = [
    ...actual.map((row) => row.date),
    ...forecast.map((row) => row.date),
  ]

  const actualProfit = [
    ...actual.map((row) => row.profit),
    ...forecast.map(() => null),
  ]

  const forecastProfit = [
    ...actual.slice(0, Math.max(actual.length - 1, 0)).map(() => null),
    ...(actual.length ? [actual[actual.length - 1].profit] : []),
    ...forecast.map((row) => row.projectedProfit),
  ]

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: '4%', right: '4%', bottom: '5%', containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        formatter: (value: string) => value.slice(5),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => `Rs ${value}`,
      },
    },
    series: [
      {
        name: 'Profit',
        type: 'line',
        smooth: true,
        data: actualProfit,
        lineStyle: { width: 3, color: '#0f766e' },
        itemStyle: { color: '#0f766e' },
      },
      {
        name: 'Forecast',
        type: 'line',
        smooth: true,
        data: forecastProfit,
        lineStyle: { width: 2, type: 'dashed', color: '#f97316' },
        itemStyle: { color: '#f97316' },
      },
      {
        name: 'Sales',
        type: 'line',
        smooth: true,
        data: [...actual.map((row) => row.sales), ...forecast.map(() => null)],
        lineStyle: { width: 2, color: '#2563eb' },
        itemStyle: { color: '#2563eb' },
      },
      {
        name: 'Expenses',
        type: 'line',
        smooth: true,
        data: [...actual.map((row) => row.expenses), ...forecast.map(() => null)],
        lineStyle: { width: 2, color: '#dc2626' },
        itemStyle: { color: '#dc2626' },
      },
    ],
  }
})
</script>

<template>
  <UDashboardPanelContent>
    <div class=" w-full p-6 space-y-6">
      <UCard
        class="sticky top-0 z-10 border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur"
        :ui="{ body: { padding: 'p-4 sm:p-5' } }"
      >
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div class="space-y-3 max-w-3xl">
            <div class="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              <UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4" />
              Admin business summary
            </div>
            <div class="space-y-1">
              <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Business Summary
              </h1>
              <p class="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                One aligned view for revenue, credit exposure, profit, stock, and trend direction.
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3 xl:items-end">
            <div class="flex flex-col gap-3 md:flex-row md:items-center">
              <UPopover :popper="{ placement: 'bottom-start' }">
                <UButton
                  icon="i-heroicons-calendar-days-20-solid"
                  color="white"
                  class="w-full md:w-72 justify-start border border-slate-200 dark:border-slate-700"
                >
                  {{ format(selectedDate.start, 'dd MMM yyyy') }}
                  -
                  {{ format(selectedDate.end, 'dd MMM yyyy') }}
                </UButton>

                <template #panel="{ close }">
                  <div class="flex divide-x divide-gray-200 dark:divide-gray-800">
                    <div class="hidden sm:flex flex-col p-2 space-y-1 w-44">
                      <UButton
                        v-for="range in quickRanges"
                        :key="range.label"
                        :label="range.label"
                        color="gray"
                        variant="ghost"
                        class="justify-start"
                        :class="isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : ''"
                        @click="selectRange(range.duration)"
                      />
                    </div>

                    <div class="p-2">
                      <DatePicker v-model="selectedDate" range @update:model-value="close" />
                    </div>
                  </div>
                </template>
              </UPopover>

              <div class="flex gap-3">
                <UButton color="gray" variant="soft" icon="i-heroicons-arrow-path" :loading="loading" @click="fetchSummary">
                  Refresh
                </UButton>
                <UButton color="primary" icon="i-heroicons-arrow-down-tray" :loading="pdfLoading" @click="downloadPdf">
                  Download PDF
                </UButton>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 px-4 py-3 w-full xl:w-auto">
              <div class="text-sm text-slate-600 dark:text-slate-300">PDF attachment</div>
              <UCheckbox v-model="includeAiInsights" label="Include AI insights" />
            </div>
          </div>
        </div>
      </UCard>

      <div v-if="loading" class="py-20 flex items-center justify-center gap-3 text-gray-500">
        <UIcon name="i-heroicons-arrow-path-20-solid" class="w-5 h-5 animate-spin" />
        <span>Loading business summary...</span>
      </div>

      <template v-else-if="summary">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-6">
          <UCard
            v-for="card in kpiCards"
            :key="card.label"
            class="h-full border border-slate-200/80 dark:border-slate-800 shadow-sm"
            :ui="{ body: { padding: 'p-4' } }"
          >
            <div class="flex h-full flex-col justify-between gap-4">
              <div class="space-y-2">
                <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {{ card.label }}
                </div>
                <div class="text-2xl font-semibold leading-none" :class="card.tone">
                  {{ card.value }}
                </div>
              </div>
              <div class="text-sm text-slate-500 dark:text-slate-400">
                {{ card.meta }}
              </div>
            </div>
          </UCard>
        </div>

        <!-- ─── Cash Flow ─── -->
        <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
          <div class="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 class="font-semibold text-slate-900 dark:text-white">Cash Flow</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400">Sources and uses of cash in the window. Net change reconciles to closing minus opening balance.</p>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-3 py-1 font-medium">In {{ formatCurrency(cashFlowRows.inflowsTotal) }}</span>
              <span class="rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 px-3 py-1 font-medium">Out {{ formatCurrency(cashFlowRows.outflowsTotal) }}</span>
              <span class="rounded-full px-3 py-1 font-semibold"
                :class="cashFlowRows.net >= 0 ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'">
                Net {{ formatCurrency(cashFlowRows.net) }}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <!-- Inflows -->
            <div class="rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/15 p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="font-medium text-emerald-700 dark:text-emerald-300">Cash in</div>
                <div class="text-sm font-semibold text-emerald-700/90 dark:text-emerald-300/90">
                  {{ formatCurrency(cashFlowRows.inflowsTotal) }}
                </div>
              </div>
              <div class="space-y-2.5">
                <div v-for="row in cashFlowRows.inflows" :key="'in-' + row.label">
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-slate-700 dark:text-slate-200">{{ row.label }}</span>
                    <span class="font-medium text-slate-900 dark:text-white">{{ formatCurrency(row.amount) }}</span>
                  </div>
                  <div class="mt-1 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 overflow-hidden">
                    <div class="h-full bg-emerald-500" :style="{ width: (row.share * 100) + '%' }" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Outflows -->
            <div class="rounded-2xl bg-rose-50/60 dark:bg-rose-950/15 p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="font-medium text-rose-700 dark:text-rose-300">Cash out</div>
                <div class="text-sm font-semibold text-rose-700/90 dark:text-rose-300/90">
                  {{ formatCurrency(cashFlowRows.outflowsTotal) }}
                </div>
              </div>
              <div class="space-y-2.5">
                <div v-for="row in cashFlowRows.outflows" :key="'out-' + row.label">
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-slate-700 dark:text-slate-200">{{ row.label }}</span>
                    <span class="font-medium text-slate-900 dark:text-white">{{ formatCurrency(row.amount) }}</span>
                  </div>
                  <div class="mt-1 h-1.5 rounded-full bg-rose-100 dark:bg-rose-950/40 overflow-hidden">
                    <div class="h-full bg-rose-500" :style="{ width: (row.share * 100) + '%' }" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Sales Breakdown</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Payment mix and strongest categories in the selected window.</p>
              </div>
              <span class="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs text-slate-600 dark:text-slate-300">Top 5 categories</span>
            </div>

            <div class="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">Payment methods</div>
                <UTable :rows="paymentRows" :columns="[{ key: 'mode', label: 'Payment' }, { key: 'amount', label: 'Amount' }]">
                  <template #amount-data="{ row }">
                    {{ formatCurrency(row.amount) }}
                  </template>
                </UTable>
              </div>

              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">Category leaders</div>
                <UTable :rows="topCategoryRows" :columns="[{ key: 'name', label: 'Category' }, { key: 'qty', label: 'Qty' }, { key: 'sales', label: 'Sales' }, { key: 'share', label: 'Share' }]">
                  <template #sales-data="{ row }">
                    {{ formatCurrency(row.sales) }}
                  </template>
                  <template #share-data="{ row }">
                    {{ formatPercent(row.share) }}
                  </template>
                </UTable>
              </div>
            </div>
          </UCard>

          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Pending Credit Bills</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Open credit exposure that still needs collection.</p>
              </div>
              <span class="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-3 py-1 text-xs font-medium">
                {{ pendingCreditRows.length }} open
              </span>
            </div>

            <div class="rounded-2xl border border-amber-100 bg-amber-50/60 dark:border-amber-950/50 dark:bg-amber-950/20 p-4 mb-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-[11px] uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-300/80">Bills</div>
                  <div class="mt-1 text-lg font-semibold text-amber-900 dark:text-amber-100">
                    {{ pendingCreditRows.length }}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-300/80">Total pending</div>
                  <div class="mt-1 text-lg font-semibold text-amber-900 dark:text-amber-100">
                    {{ formatCurrency(pendingCreditTotal) }}
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
              <UTable
                :rows="pendingCreditRows"
                :columns="[
                  { key: 'invoiceNumber', label: 'Invoice #' },
                  { key: 'createdAt', label: 'Date' },
                  { key: 'clientName', label: 'Client' },
                  { key: 'clientPhone', label: 'Phone' },
                  { key: 'grandTotal', label: 'Amount' }
                ]"
              >
                <template #createdAt-data="{ row }">
                  {{ format(new Date(row.createdAt), 'dd MMM yyyy') }}
                </template>
                <template #grandTotal-data="{ row }">
                  {{ formatCurrency(row.grandTotal) }}
                </template>
              </UTable>
            </div>
          </UCard>

        </div>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Expenses</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Where cash is going and which categories are pulling most weight.</p>
              </div>
              <div class="text-right">
                <div class="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Total</div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.expenses.total) }}</div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">Payment modes</div>
                <UTable :rows="expenseModeRows" :columns="[{ key: 'mode', label: 'Mode' }, { key: 'amount', label: 'Amount' }]">
                  <template #amount-data="{ row }">
                    {{ formatCurrency(row.amount) }}
                  </template>
                </UTable>
              </div>

              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">Category breakdown</div>
                <UTable :rows="expenseCategoryRows" :columns="[{ key: 'name', label: 'Category' }, { key: 'total', label: 'Amount' }, { key: 'share', label: 'Share' }]">
                  <template #total-data="{ row }">
                    {{ formatCurrency(row.total) }}
                  </template>
                  <template #share-data="{ row }">
                    {{ formatPercent(row.share) }}
                  </template>
                </UTable>
              </div>
            </div>
          </UCard>

          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">P&amp;L Decomposition</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Each line as a share of sales — answers "where does every rupee end up?"</p>
              </div>
              <div class="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-3 py-1 text-xs font-medium">
                {{ formatPercent(summary.profit.marginPct) }} net margin
              </div>
            </div>

            <!-- 100% stacked decomposition bar -->
            <div v-if="pnlRatios" class="mb-5">
              <div class="flex h-6 w-full overflow-hidden rounded-full ring-1 ring-slate-200 dark:ring-slate-700">
                <div class="bg-amber-400" :style="{ width: pnlRatios.cogsPct + '%' }" :title="`COGS ${formatPercent(pnlRatios.cogsPct)}`" />
                <div class="bg-rose-400" :style="{ width: pnlRatios.expensePct + '%' }" :title="`Expenses ${formatPercent(pnlRatios.expensePct)}`" />
                <div :class="pnlRatios.netPct >= 0 ? 'bg-emerald-500' : 'bg-rose-600'" :style="{ width: Math.max(0, pnlRatios.netPct) + '%' }" :title="`Net ${formatPercent(pnlRatios.netPct)}`" />
              </div>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <div class="flex items-center gap-1.5"><span class="inline-block w-2 h-2 rounded-full bg-amber-400" /> COGS {{ formatPercent(pnlRatios.cogsPct) }}</div>
                <div class="flex items-center gap-1.5"><span class="inline-block w-2 h-2 rounded-full bg-rose-400" /> Expenses {{ formatPercent(pnlRatios.expensePct) }}</div>
                <div class="flex items-center gap-1.5"><span class="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Net {{ formatPercent(pnlRatios.netPct) }}</div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[112px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">Sales (revenue)</div>
                <div class="text-xl font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.profit.totalSales) }}</div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[112px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">COGS</div>
                <div class="flex items-baseline gap-2">
                  <span class="text-xl font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.profit.totalCOGS) }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ pnlRatios ? formatPercent(pnlRatios.cogsPct) : '–' }} of sales</span>
                </div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[112px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">Gross Profit</div>
                <div class="flex items-baseline gap-2">
                  <span class="text-xl font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.profit.netProfitBeforeExpense) }}</span>
                  <span class="text-xs text-emerald-600">{{ pnlRatios ? formatPercent(pnlRatios.grossMarginPct) : '–' }} margin</span>
                </div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[112px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">Operating Expenses</div>
                <div class="flex items-baseline gap-2">
                  <span class="text-xl font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.profit.totalExpenses) }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ pnlRatios ? formatPercent(pnlRatios.expensePct) : '–' }} of sales</span>
                </div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[112px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">Net Profit</div>
                <div class="flex items-baseline gap-2">
                  <span class="text-xl font-semibold" :class="summary.profit.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                    {{ formatCurrency(summary.profit.netProfit) }}
                  </span>
                  <span class="text-xs" :class="summary.profit.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                    {{ pnlRatios ? formatPercent(pnlRatios.netPct) : '–' }}
                  </span>
                </div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[112px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">Break-even Sales</div>
                <div class="flex items-baseline gap-2">
                  <span class="text-xl font-semibold text-slate-900 dark:text-white">{{ pnlRatios ? formatCurrency(pnlRatios.breakeven) : '–' }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">expenses ÷ gross margin</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Distributors</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Payables and receivables split into two aligned lists.</p>
              </div>
              <span class="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs text-slate-600 dark:text-slate-300">Outstanding view</span>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div class="rounded-2xl bg-rose-50/80 dark:bg-rose-950/20 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <div class="font-medium text-rose-700 dark:text-rose-300">We Owe</div>
                  <div class="text-sm text-rose-700/80 dark:text-rose-300/80">{{ formatCurrency(summary.distributors.totalWeOwe) }}</div>
                </div>
                <UTable :rows="distributorRows.owe" :columns="[{ key: 'name', label: 'Distributor' }, { key: 'due', label: 'Due' }]">
                  <template #due-data="{ row }">
                    {{ formatCurrency(row.due) }}
                  </template>
                </UTable>
              </div>

              <div class="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/20 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <div class="font-medium text-emerald-700 dark:text-emerald-300">Owed To Us</div>
                  <div class="text-sm text-emerald-700/80 dark:text-emerald-300/80">{{ formatCurrency(summary.distributors.totalOwedToUs) }}</div>
                </div>
                <UTable :rows="distributorRows.receive" :columns="[{ key: 'name', label: 'Distributor' }, { key: 'due', label: 'Due' }]">
                  <template #due-data="{ row }">
                    {{ formatCurrency(row.due) }}
                  </template>
                </UTable>
              </div>
            </div>
          </UCard>

          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Investments & Money Transactions</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Structured as two balanced columns instead of stacked fragments.</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-5 md:grid-cols-[0.85fr_1.15fr]">
              <div class="grid grid-cols-1 gap-3">
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div class="text-sm text-slate-500 dark:text-slate-400">Investment In</div>
                  <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.investments.in) }}</div>
                </div>
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div class="text-sm text-slate-500 dark:text-slate-400">Investment Out</div>
                  <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.investments.out) }}</div>
                </div>
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div class="text-sm text-slate-500 dark:text-slate-400">Investment Net</div>
                  <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.investments.net) }}</div>
                </div>
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div class="text-sm text-slate-500 dark:text-slate-400">Money In / Out</div>
                  <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {{ formatCurrency(summary.moneyTransactions.in.total) }} / {{ formatCurrency(summary.moneyTransactions.out.total) }}
                  </div>
                  <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Net {{ formatCurrency(summary.moneyTransactions.net) }}
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4">
                <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div class="font-medium mb-3 text-slate-900 dark:text-white">Incoming by party</div>
                  <UTable :rows="moneyInRows" :columns="[{ key: 'party', label: 'Party' }, { key: 'amount', label: 'Amount' }]">
                    <template #amount-data="{ row }">
                      {{ formatCurrency(row.amount) }}
                    </template>
                  </UTable>
                </div>

                <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div class="font-medium mb-3 text-slate-900 dark:text-white">Outgoing by party</div>
                  <UTable :rows="moneyOutRows" :columns="[{ key: 'party', label: 'Party' }, { key: 'amount', label: 'Amount' }]">
                    <template #amount-data="{ row }">
                      {{ formatCurrency(row.amount) }}
                    </template>
                  </UTable>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[520px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Stock Snapshot</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Inventory value, take-home earnings, and unit posture in a compact grid.</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[120px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">At MRP</div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.stock.atMrp) }}</div>
              </div>

              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[120px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">At Cost</div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(summary.stock.atCost) }}</div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[120px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">SKU Count</div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">{{ summary.stock.skuCount }}</div>
              </div>
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 min-h-[120px] flex flex-col justify-between">
                <div class="text-sm text-slate-500 dark:text-slate-400">Total Units</div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">{{ summary.stock.totalUnits }}</div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[1.4fr_0.6fr]">
          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[600px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Trend Chart</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Actual profit, expense pressure, and projected continuation in one chart.</p>
              </div>
              <div class="text-sm text-slate-500 dark:text-slate-400">
                Forecast total {{ formatCurrency(summary.forecast.reduce((sum, row) => sum + row.projectedProfit, 0)) }}
              </div>
            </div>

            <div class="grid grid-cols-1">
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <ClientOnly>
                  <VChart :option="chartOptions" class="h-[420px] w-full" autoresize />
                </ClientOnly>
              </div>
            </div>
          </UCard>

          <!-- ─── Trend & Forecast Stats ─── -->
          <UCard class="border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col max-h-[600px]" :ui="{ body: { padding: 'p-5', base: 'flex-1 min-h-0 overflow-y-auto' } }">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 class="font-semibold text-slate-900 dark:text-white">Trend Stats</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">Linear regression on daily net profit + dispersion + outlier days.</p>
              </div>
              <span
                v-if="trendStats"
                class="rounded-full px-3 py-1 text-xs font-medium"
                :class="trendStats.slope >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'"
              >
                {{ trendStats.slope >= 0 ? 'Trending up' : 'Trending down' }}
              </span>
            </div>

            <div v-if="trendStats" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-sm text-slate-500 dark:text-slate-400">Daily slope</div>
                <div class="mt-1 text-lg font-semibold" :class="trendStats.slope >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                  {{ trendStats.slope >= 0 ? '+' : '' }}{{ formatCurrency(trendStats.slope) }}/day
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Profit change per additional day</div>
              </div>

              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-sm text-slate-500 dark:text-slate-400">Fit (R²)</div>
                <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{{ formatPercent(trendStats.r2 * 100) }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Higher = trend explains more of the variation</div>
              </div>

              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-sm text-slate-500 dark:text-slate-400">Avg daily profit</div>
                <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(trendStats.avg) }}</div>
              </div>

              <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                <div class="text-sm text-slate-500 dark:text-slate-400">Volatility (σ)</div>
                <div class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{{ formatCurrency(trendStats.volatility) }}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Std-dev of daily profit</div>
              </div>

              <div v-if="trendStats.best" class="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 p-4 sm:col-span-2">
                <div class="text-sm text-emerald-700 dark:text-emerald-300">Best day</div>
                <div class="mt-1 flex items-baseline justify-between">
                  <span class="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{{ formatCurrency(trendStats.best.profit) }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ trendStats.best.date }}</span>
                </div>
              </div>

              <div v-if="trendStats.worst" class="rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 p-4 sm:col-span-2">
                <div class="text-sm text-rose-700 dark:text-rose-300">Worst day</div>
                <div class="mt-1 flex items-baseline justify-between">
                  <span class="text-lg font-semibold text-rose-700 dark:text-rose-300">{{ formatCurrency(trendStats.worst.profit) }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ trendStats.worst.date }}</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </template>
    </div>
  </UDashboardPanelContent>
</template>
