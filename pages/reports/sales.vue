<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from 'vue'
import PullToRefresh from 'pulltorefreshjs'
import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'
import {
  startOfDay,
  endOfDay,
  sub,
  format,
  isSameDay,
  type Duration
} from 'date-fns'

/* =========================
   STATE
========================= */

const scrollContainer = ref<HTMLElement | null>(null)

const loading = ref(false)
const pdfLoading = ref(false)
const excelLoading = ref(false)
const receiptLoading = ref(false)

const dashboard = ref<any>(null)
const expenses = ref<any[]>([])

const selectedDate = ref({
  start: new Date(),
  end: new Date()
})

/* =========================
   AUTH
========================= */

const auth = useNuxtApp().$auth
const companyName = computed(() => auth.session.value?.companyName || '')

const toast = useToast()
const { printReport } = usePrint()

/* =========================
   FORMATTERS
========================= */

const formatCurrency = (val: number | string) => {
  return `₹${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

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

/* =========================
   FETCH MAIN REPORT
========================= */

const fetchReportFromServer = async () => {
  if (!selectedDate.value.start || !selectedDate.value.end) return

  loading.value = true

  try {
    const res = await $fetch('/api/report/report', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start).toISOString(),
        endDate: endOfDay(selectedDate.value.end).toISOString()
      }
    })

    dashboard.value = res
  } catch (err) {
    console.error(err)

    toast.add({
      title: 'Error',
      description: 'Failed to load report',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

/* =========================
   FETCH EXPENSES (PRINT)
========================= */

const fetchExpenseFromServer = async () => {
  if (!selectedDate.value.start || !selectedDate.value.end) return

  try {
    const res = await $fetch('/api/report/expenses', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start).toISOString(),
        endDate: endOfDay(selectedDate.value.end).toISOString()
      }
    })

    expenses.value = res || []
  } catch (err) {
    console.error(err)
  }
}

/* =========================
   WATCHERS
========================= */

watch([selectedDate, companyName], () => {
  fetchReportFromServer()
})

/* =========================
   PULL TO REFRESH
========================= */

onMounted(async () => {
  await nextTick()

  if (!scrollContainer.value) return

  PullToRefresh.init({
    mainElement: scrollContainer.value,
    onRefresh: () => fetchReportFromServer()
  })

  fetchReportFromServer()
})

onUnmounted(() => {
  PullToRefresh.destroyAll()
})

/* =========================
   EXPORT PDF
========================= */

const downloadPDF = async () => {
  pdfLoading.value = true

  try {
    const res = await $fetch.raw('/api/report/generate-sales.pdf', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start).toISOString(),
        endDate: endOfDay(selectedDate.value.end).toISOString()
      },
      headers: { Accept: 'application/pdf' }
    })

    const blob = new Blob([res._data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const disposition = res.headers.get('content-disposition')
    const filename =
      disposition?.match(/filename="(.+)"/)?.[1] || 'sales-report.pdf'

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
  } catch (err) {
    toast.add({
      title: 'PDF Error',
      description: 'Failed to download PDF',
      color: 'red'
    })
  } finally {
    pdfLoading.value = false
  }
}

const downloadExcel = async () => {
  excelLoading.value = true

  try {
    const res = await $fetch.raw('/api/report/generate-sales.excel', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start).toISOString(),
        endDate: endOfDay(selectedDate.value.end).toISOString()
      },
      headers: {
        Accept:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })

    /* ---------- CREATE BLOB ---------- */

    const blob = new Blob([res._data], {
      type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })

    const url = URL.createObjectURL(blob)



    /* ---------- FILENAME ---------- */

    const disposition =
      res.headers.get('content-disposition')

    const filename =
      disposition?.match(/filename="(.+)"/)?.[1] ||
      'summary.xlsx'



    /* ---------- DOWNLOAD ---------- */

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)

  } catch (err) {
    toast.add({
      title: 'Excel Error',
      description: 'Failed to download Excel',
      color: 'red'
    })
  } finally {
    excelLoading.value = false
  }
}


/* =========================
   PRINT REPORT
========================= */

const printReportHandle = async () => {
  receiptLoading.value = true

  await fetchExpenseFromServer()

  try {
    const printData = {
      companyName: auth.session.value?.companyName || '',
      companyAddress: auth.session.value?.address || {},
      expenses: expenses.value,

      dateRange:
        isSameDay(selectedDate.value.start, selectedDate.value.end)
          ? format(selectedDate.value.start, 'dd MMM yyyy')
          : `${format(selectedDate.value.start, 'dd MMM yyyy')} to ${format(
              selectedDate.value.end,
              'dd MMM yyyy'
            )}`,

      totalRevenue: dashboard.value?.totalSales || 0,
      totalRevenueInCash:
        dashboard.value?.salesByPaymentMethod?.Cash || 0,
      totalRevenueInUPI:
        dashboard.value?.salesByPaymentMethod?.UPI || 0,

      totalExpense: dashboard.value?.totalExpenses || 0,
      totalExpensesInCash:
        dashboard.value?.expensesByPaymentMethod?.Cash || 0,
      totalExpensesInUPI:
        dashboard.value?.expensesByPaymentMethod?.UPI || 0,

      amountInDrawer:
        dashboard.value?.balances?.cashBalance || 0,
      amountInUPI:
        dashboard.value?.balances?.bankBalance || 0
    }

    printReport(printData)
  } catch (err) {
    console.error(err)
  } finally {
    receiptLoading.value = false
  }
}

/* =========================
   DROPDOWN ACTIONS
========================= */

const actions = () => [
  [
    {
      label: 'Download PDF',
      icon: 'i-heroicons-arrow-down-tray',
      click: downloadPDF,
      loading: pdfLoading.value
    }
  ],
  [
    {
      label: 'Download EXCEL',
      icon: 'i-heroicons-arrow-down-tray',
      click: downloadExcel,
      loading: excelLoading.value
    }
  ],
  [
    {
      label: 'Print Report',
      icon: 'i-heroicons-printer',
      click: printReportHandle,
      loading: receiptLoading.value
    }
  ]
]

/* =========================
   COMPUTED HELPERS
========================= */

const openingBalances = computed(
  () => dashboard.value?.balances?.opening || {}
)

const closingBalances = computed(
  () => dashboard.value?.balances || {}
)

const salesByMode = computed(
  () => dashboard.value?.salesByPaymentMethod || {}
)

const expenseByMode = computed(
  () => dashboard.value?.expensesByPaymentMethod || {}
)

const purchaseExpenseByMode = computed(
  () => dashboard.value?.purchaseExpensesByPaymentMethod || {}
)

const transfers = computed(
  () => dashboard.value?.transfers || {}
)

const transactions = computed(
  () => dashboard.value?.transactions || {}
)

const categorySales = computed(
  () => dashboard.value?.categorySales || []
)

const revenueByCategory = computed(
  () => dashboard.value?.revenueByCategory || []
)
</script>

<template>
  <UDashboardPanelContent>

    <!-- ================= LOADING ================= -->
    <div
      v-if="loading"
      class="w-full flex justify-center items-center py-20"
    >
      <UIcon
        name="i-heroicons-arrow-path-20-solid"
        class="animate-spin w-5 h-5 text-gray-500 mr-2"
      />
      <span>Loading report...</span>
    </div>

    <!-- ================= CONTENT ================= -->
    <div v-else ref="scrollContainer" class="scroll-container">
      <ClientOnly>
        <div class="space-y-6 p-6">

          <!-- ================= HEADER ================= -->
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

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

            <!-- Export -->
              <UDropdown :items="actions()">
                <UButton
                  label="Export / Print"
                  icon="i-heroicons-chevron-down"
                  color="primary"
                />
              </UDropdown>
          </div>

          <!-- ================= KPI ================= -->
          <div
            v-if="dashboard"
            class="grid grid-cols-1 sm:grid-cols-5 gap-4"
          >
          <UCard>
              <div class="text-sm text-gray-500">Opening Balance</div>
              <div class="text-xl font-semibold mb-3">
                {{ formatCurrency(dashboard.balances.opening.total || 0) }}
              </div>
               <UTable
              :rows="[
                { mode:'Cash', amount:formatCurrency(dashboard.balances.opening.cash || 0) },
                { mode:'Bank', amount:formatCurrency(dashboard.balances.opening.bank || 0) },
              ]"
              :columns="[
                { key:'mode', label:'Mode' },
                { key:'amount', label:'Amount' }
              ]"
            />
            </UCard>

            <UCard>
              <div class="text-sm text-gray-500">Total Revenue</div>
              <div class="text-xl font-semibold mb-3">
                {{ formatCurrency(dashboard.totalSales) }}
              </div>
              
            <UTable
              :rows="[
                { mode:'Cash', amount:formatCurrency(salesByMode.Cash || 0) },
                { mode:'UPI', amount:formatCurrency(salesByMode.UPI || 0) },
                { mode:'Card', amount:formatCurrency(salesByMode.Card || 0) },
                { mode:'Credit', amount:formatCurrency(salesByMode.Credit || 0) }
              ]"
              :columns="[
                { key:'mode', label:'Payment Mode' },
                { key:'amount', label:'Amount' }
              ]"
            />
            </UCard>

            <UCard>
              <div class="text-sm text-gray-500">Total Expense</div>
              <div class="text-xl font-semibold mb-3">
                {{ formatCurrency(dashboard.totalExpenses) }}
              </div>
               <UTable
                :rows="[
                  { mode:'Cash', amount:formatCurrency(expenseByMode.Cash || 0) },
                  { mode:'UPI', amount:formatCurrency(expenseByMode.UPI || 0) },
                  { mode:'Card', amount:formatCurrency(expenseByMode.Card || 0) },
                  { mode:'Bank', amount:formatCurrency(expenseByMode.BankTransfer || 0) },
                  { mode:'Cheque', amount:formatCurrency(expenseByMode.Cheque || 0) }
                ]"
                :columns="[
                  { key:'mode', label:'Mode' },
                  { key:'amount', label:'Amount' }
                ]"
              />
            </UCard>

            
            <UCard>
              <div class="text-sm text-gray-500">Total Purchase</div>
              <div class="text-xl font-semibold mb-3">
                {{ formatCurrency(dashboard.totalPurchaseExpense) }}
              </div>
              
              <UTable
                :rows="[
                  { mode:'Cash', amount:formatCurrency(purchaseExpenseByMode.Cash || 0) },
                  { mode:'UPI', amount:formatCurrency(purchaseExpenseByMode.UPI || 0) },
                  { mode:'Card', amount:formatCurrency(purchaseExpenseByMode.Card || 0) },
                  { mode:'Bank', amount:formatCurrency(purchaseExpenseByMode.BankTransfer || 0) },
                  { mode:'Cheque', amount:formatCurrency(purchaseExpenseByMode.Cheque || 0) }
                ]"
                :columns="[
                  { key:'mode', label:'Mode' },
                  { key:'amount', label:'Amount' }
                ]"
              />
            </UCard>

            <UCard>
              <div class="text-sm text-gray-500">Closing Balance</div>
              <div class="text-xl font-semibold mb-3">
                {{ formatCurrency(closingBalances.totalBalance) }}
              </div>
              <UTable
              :rows="[
                { mode:'Cash', amount:formatCurrency(closingBalances.cashBalance || 0) },
                { mode:'Bank', amount:formatCurrency(closingBalances.bankBalance || 0) },
              ]"
              :columns="[
                { key:'mode', label:'Mode' },
                { key:'amount', label:'Amount' }
              ]"
            />
            </UCard>
          </div>

      
          
           <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            
      
          <!-- ================= TRANSFERS ================= -->
          <UCard>
            <h3 class="font-semibold mb-3">Account Transfers</h3>

            <UTable
              :rows="[
                {
                  type:'Cash',
                  debit:transfers.cash?.debit,
                  credit:transfers.cash?.credit,
                  net:transfers.cash?.net
                },
                {
                  type:'Bank',
                  debit:transfers.bank?.debit,
                  credit:transfers.bank?.credit,
                  net:transfers.bank?.net
                }
              ]"
              :columns="[
                { key:'type', label:'Account' },
                { key:'debit', label:'Debit', formatter:formatCurrency },
                { key:'credit', label:'Credit', formatter:formatCurrency },
                { key:'net', label:'Net', formatter:formatCurrency }
              ]"
            />
          </UCard>

          <!-- ================= TRANSACTIONS ================= -->
          <UCard>
            <h3 class="font-semibold mb-3">Money Transactions</h3>

            <UTable
              :rows="[
                {
                  type:'Cash',
                  debit:transactions.cash?.debit,
                  credit:transactions.cash?.credit,
                  net:transactions.cash?.net
                },
                {
                  type:'Bank',
                  debit:transactions.bank?.debit,
                  credit:transactions.bank?.credit,
                  net:transactions.bank?.net
                }
              ]"
              :columns="[
                { key:'type', label:'Account' },
                { key:'debit', label:'Debit', formatter:formatCurrency },
                { key:'credit', label:'Credit', formatter:formatCurrency },
                { key:'net', label:'Net', formatter:formatCurrency }
              ]"
            />
          </UCard>
     
            </div>

          <!-- ================= CATEGORY ================= -->
          <div class="flex flex-col lg:flex-row gap-4 lg:h-[400px]">

            <!-- Table -->
            <UCard class="flex-1 p-4 overflow-y-auto">
              <h3 class="font-semibold mb-3">
                Category Sales
              </h3>

              <UTable
                :rows="categorySales"
                :columns="[
                  { key:'name', label:'Category' },
                  { key:'qty', label:'Qty' },
                  { key:'sales', label:'Sales', formatter:formatCurrency }
                ]"
              />
            </UCard>

            <!-- Pie -->
            <UCard class="flex-1">
              <CategoryRevenuePie
                :revenueByCategory="revenueByCategory"
                title="Revenue by Category"
              />
            </UCard>

          </div>

        </div>
      </ClientOnly>
    </div>

  </UDashboardPanelContent>
</template>
