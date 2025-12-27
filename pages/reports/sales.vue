<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import PullToRefresh from 'pulltorefreshjs'
import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'
import { startOfDay, endOfDay,sub, format, isSameDay, type Duration  } from 'date-fns'



const scrollContainer = ref<HTMLElement | null>(null)
const colorMode = useColorMode()
const loading = ref(false)
const recieptLoading = ref(false)
const iconColorClass = computed(() =>
  colorMode.value === 'dark' ? 'text-white' : 'text-gray-800'
)

onMounted(async () => {
  await nextTick()

  if (!scrollContainer.value) {
    console.warn('Scroll container not found!')
    return
  }

  const arrowIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 ${iconColorClass.value}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  `

  const refreshingIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 ${iconColorClass.value} animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582M20 20v-5h-.582M4 4a9 9 0 0116 0m-8 16a9 9 0 01-8-9h1.5" />
    </svg>
  `

 PullToRefresh.init({
  mainElement: scrollContainer.value,
  onRefresh: () => fetchReportFromServer(),
})

})

onUnmounted(() => {
  PullToRefresh.destroyAll()
})

// Refs

const useAuth = () => useNuxtApp().$auth;
const companyName = computed(() => useAuth().session.value?.companyName);
const { printReport } = usePrint();
let printData = {}


const dashboard = ref({
})
const expenses = ref({
})
const fullReport = ref(false)
const pdfLoading = ref(false)
const toast = useToast()

const selectedDate = ref({ 
    start: new Date() , 
    end: new Date() 
});

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const fetchReportFromServer = async () => {
  loading.value = true;
  if (!selectedDate.value.start || !selectedDate.value.end) return;

  try {
    const res = await $fetch('/api/report/report', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start),
        endDate: endOfDay(selectedDate.value.end),
      },
    });
    console.log(res)
    dashboard.value = res;
  } catch (error) {
    console.error('Failed to fetch server report:', error);
  }finally {
    loading.value = false;
  }
};
const fetchexpenseFromServer = async () => {
  if (!selectedDate.value.start || !selectedDate.value.end) return;

  try {
    const res = await $fetch('/api/report/expenses', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start),
        endDate: endOfDay(selectedDate.value.end),
      },
    });
    console.log(res)
    expenses.value = res;
  } catch (error) {
    console.error('Failed to fetch server report:', error);
  }
};

watch([selectedDate, companyName], ([date, companyName]) => {
  if (date && !fullReport.value) {
    fetchReportFromServer();
  }
});

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

const actions = () => [
  [
    {
      label: 'Download PDF',
      icon: 'i-heroicons-arrow-down-tray',
      click: downloadPDF,
      loading: pdfLoading
    },
  ],
  [
    {
      label: 'Print Report',
      icon: 'i-heroicons-printer',
      click: printReportHandle,
      loading: recieptLoading
    },
  ],
]



// Helper functions
const formatCurrency = (val: number) => `₹${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`



const downloadPDF = async () => {
  pdfLoading.value = true

  try {
    const res = await $fetch.raw('/api/report/generate-sales.pdf', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start),
        endDate: endOfDay(selectedDate.value.end),
      },
      headers: {
        Accept: 'application/pdf'
      }
    })

    const blob = new Blob([res._data], { type: 'application/pdf' })

    // Try to extract filename from header
    const contentDisposition = res.headers.get('content-disposition')
    const filename =
      contentDisposition?.match(/filename="(.+)"/)?.[1] ||
      'sales-report.pdf'

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()

    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('PDF Download Error:', error)
    toast.add({
      title: 'PDF Error',
      description: 'Failed to download PDF',
      color: 'red'
    })
  } finally {
    pdfLoading.value = false
  }
}


// Initialize
onMounted(() => {
  fetchReportFromServer()
})

const printReportHandle = async() => {
    recieptLoading.value = true
    await fetchexpenseFromServer()
  try {
    printData = {
      companyName: useAuth().session.value?.companyName || '',
      companyAddress: useAuth().session.value?.address || {},
      expenses: expenses.value || [],
      dateRange: selectedDate.value.start === selectedDate.value.end
        ? `${selectedDate.value.start || 'Start'}`
        : `${selectedDate.value.start || 'Start'} to ${selectedDate.value.end || 'End'}`,
      totalRevenue: dashboard?.value.totalSales,
      totalRevenueInCash: dashboard?.value.salesByPaymentMethod.Cash,
      totalRevenueInUPI: dashboard?.value.salesByPaymentMethod.UPI,
      totalExpense: dashboard?.value.totalExpense,
      totalExpensesInUPI: dashboard?.value.expensesByPaymentMethod.UPI,
      totalExpensesInCash: dashboard?.value.expensesByPaymentMethod.Cash,
      amountInUPI: dashboard?.value.balances.bankBalance,
      amountInDrawer: dashboard?.value.balances.cashBalance
    }
    printReport(printData)
  } catch(err) {
    console.log(err)
  }finally{
    recieptLoading.value = false
  }
}
</script>

<template>
  <UDashboardPanelContent>
    <!-- Loading -->
    <div v-if="loading" class="w-full flex justify-center items-center py-20">
      <UIcon
        name="i-heroicons-arrow-path-20-solid"
        class="animate-spin w-5 h-5 text-gray-500 mr-2"
      />
      <span>Loading data...</span>
    </div>

    <!-- Content -->
    <div v-else ref="scrollContainer" class="scroll-container">
      <ClientOnly>
        <div class="space-y-6 p-6">

          <!-- Header -->
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
            <div class="flex flex-wrap items-center gap-3">
              <!-- Date Picker -->
              <UPopover :popper="{ placement: 'bottom-start' }" class="z-10 w-full sm:w-60">
                <UButton icon="i-heroicons-calendar-days-20-solid" class="w-full sm:w-60">
                  {{ format(selectedDate.start, 'd MMM, yyy') }} -
                  {{ format(selectedDate.end, 'd MMM, yyy') }}
                </UButton>

                <template #panel="{ close }">
                  <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800 w-full sm:w-auto">
                    <div class="hidden sm:flex flex-col py-4">
                      <UButton
                        v-for="(range, index) in ranges"
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

                    <DatePicker v-model="selectedDate" @close="close" class="w-full sm:w-auto" />
                  </div>
                </template>
              </UPopover>

            </div>
                        <!-- Export -->
              <UDropdown :items="actions()" class="w-full sm:w-auto">
                <UButton
                  icon="i-heroicons-chevron-down"
                  label="Export / Print"
                  color="primary"
                  class="w-full sm:w-auto"
                />
              </UDropdown>
          </div>

          <!-- KPI Cards -->
          <div v-if="dashboard" class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <UCard>
              <div class="text-sm text-gray-500">Total Revenue</div>
                <div class="text-xl font-semibold">
                  {{ formatCurrency(dashboard.totalSales) }}
                </div>
              </UCard>
              <UCard>
                 <div class="text-sm text-gray-500">Total Credit</div>
                  <div class="text-xl font-semibold">
                    {{ formatCurrency(dashboard.salesByPaymentMethod.Credit) }}
                  </div>
              </UCard>
            <UCard>
              <div class="text-sm text-gray-500">Total Expense</div>
                <div class="text-xl font-semibold">
                  {{ formatCurrency(dashboard.totalExpenses) }}
                </div>
              </UCard>
            <UCard>
              <div class="text-sm text-gray-500">Balance</div>
                <div class="text-xl font-semibold">
                  {{ formatCurrency(dashboard.balances.totalBalance) }}
                </div>
              </UCard>
          </div>

          <!-- 🔥 Summary Tables -->
          <div
            v-if="dashboard"
            class="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <!-- Revenue -->
            <UCard>
              <h3 class="font-semibold mb-3">Revenue Breakdown</h3>
              <UTable
                :rows="[
                  { mode: 'Cash', amount: dashboard.salesByPaymentMethod.Cash },
                  { mode: 'UPI', amount: dashboard.salesByPaymentMethod.UPI },
                  { mode: 'Card', amount: dashboard.salesByPaymentMethod.Card }
                ]"
                :columns="[
                  { key: 'mode', label: 'Mode' },
                  { key: 'amount', label: 'Amount', formatter: formatCurrency }
                ]"
              />
            </UCard>

            <!-- Expense -->
            <UCard>
              <h3 class="font-semibold mb-3">Expense Breakdown</h3>
              <UTable
                :rows="[
                  { mode: 'Cash', amount: dashboard.expensesByPaymentMethod.Cash },
                  { mode: 'UPI', amount: dashboard.expensesByPaymentMethod.UPI },
                  { mode: 'Card', amount: dashboard.expensesByPaymentMethod.Card },
                  { mode: 'Bank Transfer', amount: dashboard.expensesByPaymentMethod.BankTransfer },
                  { mode: 'Cheque', amount: dashboard.expensesByPaymentMethod.Cheque }
                ]"
                :columns="[
                  { key: 'mode', label: 'Mode' },
                  { key: 'amount', label: 'Amount', formatter: formatCurrency }
                ]"
              />
            </UCard>

            <!-- Balance -->
            <UCard>
              <h3 class="font-semibold mb-3">Balance</h3>
              <UTable
                :rows="[
                  { type: 'Cash Balance', amount: dashboard.balances.cashBalance },
                  { type: 'Bank Balance', amount: dashboard.balances.bankBalance }
                ]"
                :columns="[
                  { key: 'type', label: 'Type' },
                  { key: 'amount', label: 'Amount', formatter: formatCurrency }
                ]"
              />
            </UCard>
          </div>

          <!-- Category Table + Pie -->
          <div class="flex flex-col lg:flex-row gap-4 lg:h-[400px]">
  <UCard class="flex-1 rounded-2xl p-4 lg:overflow-y-scroll">
    <div class="overflow-x-auto">
      <UTable
        :rows="dashboard?.categorySales || []"
        :columns="[
          { key: 'name', label: 'Category' },
          { key: 'sales', label: 'Sales' }
        ]"
      />
    </div>
  </UCard>

  <UCard class="flex-1">
    <CategoryRevenuePie
      v-if="dashboard?.revenueByCategory"
      :revenueByCategory="dashboard.revenueByCategory"
      title="Category"
    />
  </UCard>
</div>


        </div>
      </ClientOnly>
    </div>
  </UDashboardPanelContent>
</template>
