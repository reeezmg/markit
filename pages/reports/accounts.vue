<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'
import {
  startOfDay,
  endOfDay,
  sub,
  format,
  isSameDay,
  type Duration
} from 'date-fns'
/* -----------------------------
  STATE
------------------------------ */
const loading = ref(true)
const report = ref<any>(null)

const selectedDate = ref({
  start: new Date(),
  end: new Date()
})



/* =========================
   DATE HELPERS
========================= */

function isRangeSelected(duration: Duration) {
  return (
    isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
  )
}

function selectRange(duration: Duration) {
  selectedDate.value = {
    start: sub(new Date(), duration),
    end: new Date()
  }
}

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]


/* -----------------------------
  FETCH
------------------------------ */
const fetchReport = async () => {
  loading.value = true

  report.value = await $fetch('/api/report/account', {
    params: {
      from: selectedDate.value.start.toISOString(),
      to: selectedDate.value.end.toISOString()
    }
  })

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

const pnl = computed(() => ({
  sales: report.value?.pnl?.sales ?? 0,
  expenses: report.value?.pnl?.expenses ?? 0,
  netProfit: report.value?.pnl?.netProfit ?? 0,
  totalDistributorPayments: report.value?.pnl?.totalDistributorPayments ?? 0
}))



const breakdown = computed(() => report.value?.breakdown ?? {})

const charts = computed(() => report.value?.charts ?? {})

/* -----------------------------
  TABLE DATA
------------------------------ */
const cashTable = computed(() => {
  const c = breakdown.value.cash
  if (!c) return []

  return [
    { label: 'Opening Balance', value: c.openingBalance },
    { label: 'Sales', value: c.sales },
    { label: 'Expenses', value: -c.expenses },
    { label: 'Purchase', value: -c.distributorPayments },
    { label: 'Money Received', value: c.moneyReceived },
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
    { label: 'Expenses', value: -b.expenses },
    { label: 'Purchase', value: -b.distributorPayments },
    { label: 'Money Received', value: b.moneyReceived },
    { label: 'Money Given', value: -b.moneyGiven },
    { label: 'Transfers In', value: b.transfersIn },
    { label: 'Transfers Out', value: -b.transfersOut },
    { label: 'Closing Balance', value: b.closingBalance }
  ]
})

/* -----------------------------
  CHART DATA
------------------------------ */
const cashFlowChart = computed(() => charts.value.cashFlow ?? [])
const bankFlowChart = computed(() => charts.value.bankFlow ?? [])
const pnlPieChart = computed(() => charts.value.pnlPie ?? [])

/* -----------------------------
  BUSINESS WORTH
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

    <!-- CONTENT -->
    <div v-else class="p-6 space-y-8">
      <!-- Date Picker -->
            <UPopover
              :popper="{ placement: 'bottom-start' }"
              class="z-10 w-full sm:w-60"
            >
              <UButton
                icon="i-heroicons-calendar-days-20-solid"
                class="w-full sm:w-60"
              >
                {{ format(selectedDate.start,'d MMM yyyy') }}
                -
                {{ format(selectedDate.end,'d MMM yyyy') }}
              </UButton>

              <template #panel="{ close }">
                <div class="flex sm:divide-x divide-gray-200">

                  <!-- Quick Ranges -->
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton
                      v-for="(range,index) in ranges"
                      :key="index"
                      :label="range.label"
                      variant="ghost"
                      class="rounded-none px-6"
                      @click="selectRange(range.duration)"
                    />
                  </div>

                  <DatePicker
                    v-model="selectedDate"
                    @close="close"
                  />
                </div>
              </template>
            </UPopover>

      <!-- ==============================
           BALANCES
      ============================== -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <UCard>
          <div class="text-sm text-gray-500">Cash Balance</div>
          <div class="text-2xl font-semibold">
            {{ formatCurrency(balances.cash) }}
          </div>
        </UCard>

        <UCard>
          <div class="text-sm text-gray-500">
            Bank Balance (Primary)
          </div>
          <div class="text-2xl font-semibold">
            {{ formatCurrency(balances.bank) }}
          </div>
        </UCard>

        <UCard>
          <div class="text-sm text-gray-500">
            Investment Balance
          </div>
          <div class="text-2xl font-semibold">
            {{ formatCurrency(balances.investment) }}
          </div>
        </UCard>

      </div>

      <!-- ==============================
           PROFIT & LOSS
      ============================== -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">

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

        <UCard>
          <div class="text-sm text-gray-500">Purchase</div>
          <div class="text-xl font-semibold text-red-600">
            {{ formatCurrency(pnl.totalDistributorPayments) }}
          </div>
        </UCard>

      </div>

      <!-- ==============================
           CASH & BANK BREAKDOWN
      ============================== -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- CASH -->
        <UCard>
          <div class="font-semibold mb-3">
            Cash Breakdown
          </div>

          <UTable
            :rows="cashTable"
            :columns="[
              { key: 'label', label: 'Source' },
              { key: 'value', label: 'Amount' }
            ]"
          >
            <template #value-data="{ row }">
              <span
                :class="
                  row.value < 0
                    ? 'text-red-600'
                    : 'text-green-600'
                "
              >
                {{ formatCurrency(row.value) }}
              </span>
            </template>
          </UTable>
        </UCard>

        <!-- BANK -->
        <UCard>
          <div class="font-semibold mb-3">
            Bank Breakdown
          </div>

          <UTable
            :rows="bankTable"
            :columns="[
              { key: 'label', label: 'Source' },
              { key: 'value', label: 'Amount' }
            ]"
          >
            <template #value-data="{ row }">
              <span
                :class="
                  row.value < 0
                    ? 'text-red-600'
                    : 'text-green-600'
                "
              >
                {{ formatCurrency(row.value) }}
              </span>
            </template>
          </UTable>
        </UCard>

      </div>

      <!-- ==============================
           CHARTS
      ============================== -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- CASH FLOW -->
        <UCard class="lg:col-span-1">
          <CategoryRevenuePie
            :revenueByCategory="cashFlowChart"
            title="Cash Flow"
          />
        </UCard>

        <!-- BANK FLOW -->
        <UCard class="lg:col-span-1">
          <CategoryRevenuePie
            :revenueByCategory="bankFlowChart"
            title="Bank Flow"
          />
        </UCard>

        <!-- PNL PIE -->
        <UCard class="lg:col-span-1">
          <CategoryRevenuePie
            :revenueByCategory="pnlPieChart"
            title="P&L Distribution"
          />
        </UCard>

      </div>


    </div>
  </UDashboardPanelContent>
</template>

