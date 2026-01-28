<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'

import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'


/* -----------------------------
  STATE
------------------------------ */
const loading = ref(true)
const report = ref<any>(null)

const selectedDate = ref({
  start: new Date(),
  end: new Date()
})



/* -----------------------------
  FETCH
------------------------------ */
const fetchReport = async () => {
  loading.value = true

  report.value = await $fetch('/api/report/account')

  loading.value = false
}

onMounted(fetchReport)
watch(selectedDate, fetchReport)

/* -----------------------------
  HELPERS
------------------------------ */
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(v ?? 0)

/* -----------------------------
  CORE DATA
------------------------------ */
const balances = computed(() => report.value?.balances ?? {})
const pnl = computed(() => report.value?.pnl ?? {})
const breakdown = computed(() => report.value?.breakdown ?? {})
const investmentSummary = computed(() => report.value?.investmentSummary ?? {})
const charts = computed(() => report.value?.charts ?? {})

/* -----------------------------
  TABLE DATA (EXPLAINABILITY)
------------------------------ */
const cashTable = computed(() => {
  const c = breakdown.value.cash
  if (!c) return []

  return [
    { label: 'Opening Balance', value: c.openingBalance },
    { label: 'Sales', value: c.sales },
    { label: 'Money Received', value: c.moneyReceived },
    { label: 'Expenses', value: -c.expenses },
    { label: 'Money Given', value: -c.moneyGiven },
    { label: 'Transfers In', value: c.transfersIn },
    { label: 'Transfers Out', value: -c.transfersOut },
    { label: 'Closing Balance', value: c.closingBalance }
  ]
})

const bankTable = computed(() => {
  const b = breakdown.value.bank
  if (!b) return []

  return [
    { label: 'Opening Balance', value: b.openingBalance },
    { label: 'Sales', value: b.sales },
    { label: 'Money Received', value: b.moneyReceived },
    { label: 'Expenses', value: -b.expenses },
    { label: 'Money Given', value: -b.moneyGiven },
    { label: 'Transfers In', value: b.transfersIn },
    { label: 'Transfers Out', value: -b.transfersOut },
    { label: 'Closing Balance', value: b.closingBalance }
  ]
})

/* -----------------------------
  CHART DATA (READY TO USE)
------------------------------ */
const cashFlowChart = computed(() => charts.value.cashFlow ?? [])
const bankFlowChart = computed(() => charts.value.bankFlow ?? [])
const pnlPieChart = computed(() => charts.value.pnlPie ?? [])

/* -----------------------------
  SUMMARY METRICS
------------------------------ */
const businessWorth = computed(() =>
  (balances.value.cash || 0) +
  (balances.value.bank || 0) +
  (balances.value.investment || 0) +
  (pnl.value.netProfit || 0)
)
</script>

<template>
  <UDashboardPanelContent>
    <!-- LOADING -->
    <div v-if="loading" class="flex justify-center items-center py-20">
      <UIcon
        name="i-heroicons-arrow-path-20-solid"
        class="animate-spin w-5 h-5 text-gray-500 mr-2"
      />
      <span>Loading accounts report...</span>
    </div>

    <div v-else class="p-6 space-y-8">


      <!-- BALANCES -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UCard>
          <div class="text-sm text-gray-500">Cash Balance</div>
          <div class="text-2xl font-semibold">
            {{ formatCurrency(balances.cash) }}
          </div>
        </UCard>

        <UCard>
          <div class="text-sm text-gray-500">Bank Balance (primary)</div>
          <div class="text-2xl font-semibold">
            {{ formatCurrency(balances.bank) }}
          </div>
        </UCard>

        <UCard>
          <div class="text-sm text-gray-500">Investment Balance</div>
          <div class="text-2xl font-semibold">
            {{ formatCurrency(balances.investment) }}
          </div>
        </UCard>
      </div>

      <!-- PROFIT & LOSS -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UCard>
          <div class="text-sm text-gray-500">Sales</div>
          <div class="text-xl font-semibold">
            {{ formatCurrency(pnl.sales) }}
          </div>
        </UCard>

        <UCard>
          <div class="text-sm text-gray-500">Expenses</div>
          <div class="text-xl font-semibold text-red-600">
            {{ formatCurrency(pnl.expenses) }}
          </div>
        </UCard>

      </div>

      <!-- CASH & BANK BREAKDOWN TABLES -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- CASH -->
        <UCard>
          <div class="font-semibold mb-3">Cash Breakdown</div>
          <UTable
            :rows="cashTable"
            :columns="[
              { key: 'label', label: 'Source' },
              { key: 'value', label: 'Amount' }
            ]"
          >
            <template #value-data="{ row }">
              <span
                :class="row.value < 0 ? 'text-red-600' : 'text-green-600'"
              >
                {{ formatCurrency(row.value) }}
              </span>
            </template>
          </UTable>
        </UCard>

        <!-- BANK -->
        <UCard>
          <div class="font-semibold mb-3">Bank Breakdown</div>
          <UTable
            :rows="bankTable"
            :columns="[
              { key: 'label', label: 'Source' },
              { key: 'value', label: 'Amount' }
            ]"
          >
            <template #value-data="{ row }">
              <span
                :class="row.value < 0 ? 'text-red-600' : 'text-green-600'"
              >
                {{ formatCurrency(row.value) }}
              </span>
            </template>
          </UTable>
        </UCard>
      </div>

      <!-- CHARTS -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <UCard class="lg:col-span-1">
        <CategoryRevenuePie
          :revenueByCategory="cashFlowChart"
          title="Cash FLow"
        />
        </UCard>

        <UCard class="lg:col-span-1">
        <CategoryRevenuePie
          :revenueByCategory="bankFlowChart"
          title="Bank Flow"
        />
        </UCard>

        <UCard class="lg:col-span-1">
        <CategoryRevenuePie
          :revenueByCategory="pnlPieChart"
          title="P&L Distribution"
        />
        </UCard>
      </div>

      <!-- NOTE -->
      <!-- <UAlert
        color="gray"
        variant="subtle"
        title="Note"
        description="Investments and internal transfers do not affect profit. Profit is calculated only from sales and expenses."
      /> -->
    </div>
  </UDashboardPanelContent>
</template>
