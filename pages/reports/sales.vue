<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import PullToRefresh from 'pulltorefreshjs'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import TopProducts from '@/components/dashboard/TopProducts.vue'
import RevenueEChart from '@/components/dashboard/RevenueEChart.vue'
import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'
import { useCompanyDashboard } from '@/lib/api/useDashboardData'
import { exportToCSV } from '~/utils/export-csv'
import { startOfDay, endOfDay,sub, format, isSameDay, type Duration  } from 'date-fns'
import type { DashboardComposable, BillWithRelations, KpiItem, PdfReportMeta } from '~/types/dashboard'


const scrollContainer = ref<HTMLElement | null>(null)
const colorMode = useColorMode()
const loading = ref(false)
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
const fullReport = ref(false)
const quickRange = ref('Today')
const quickRanges = ['Today','This Month', 'Last Month']
const csvLoading = ref(false)
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
    const res = await $fetch('/api/report', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start),
        endDate: endOfDay(selectedDate.value.end),
      },
    });
  
    dashboard.value = res;
  } catch (error) {
    console.error('Failed to fetch server report:', error);
  }finally {
    loading.value = false;
  }
};

watch([selectedDate, companyName], ([date, companyName]) => {
  if (date && !fullReport.value) {
    fetchReportFromServer();
  }
});

watch(dashboard, (newdashboard) => {
  console.log('Dashboard data updated:', newdashboard);
});

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]



// Computed properties
const isDownloadDisabled = computed(() => {
  return loading.value || !dashboard.value.bills || 
    (!fullReport.value && !selectedDate.value.start && !selectedDate.value.end && !quickRange.value)
})


const totals = computed(() => {
  const bills = dashboard.value.bills || [];

  const totalBills = bills?.length;

  const totalSales = bills
    .flatMap(b => b.entries ?? [])
    .reduce((sum, entry) => sum + ((entry.rate ?? 0) * (entry.qty ?? 0)), 0);

  const totalRevenue = bills
    .filter(bill => bill.paymentStatus === 'PAID')
    .reduce((sum, bill) => sum + (bill.grandTotal ?? 0), 0);

  const totalCredit = bills
    .filter(bill => bill.paymentStatus === 'PENDING')
    .reduce((sum, bill) => sum + (bill.grandTotal ?? 0), 0);

  let totalRevenueInCash = 0;
  let totalRevenueInUPI = 0;

  bills.forEach(bill => {
    if (bill.splitPayments && Array.isArray(bill.splitPayments)) {
      bill.splitPayments.forEach(payment => {
        if (payment.method === 'Cash') {
          totalRevenueInCash += payment.amount ?? 0;
        } else if (payment.method === 'UPI') {
          totalRevenueInUPI += payment.amount ?? 0;
        }
      });
    } else {
      // Fallback for non-split payments
      const method = bill.paymentMethod;
      const amount = bill.grandTotal ?? 0;
      if (method === 'Cash') {
        totalRevenueInCash += amount;
      } else if (method === 'UPI') {
        totalRevenueInUPI += amount;
      }
    }
  });

  const totalRevenueInCredit = bills
    .filter(bill => bill.paymentMethod === 'Credit')
    .reduce((sum, bill) => sum + (bill.grandTotal ?? 0), 0)

  const totalDiscount = totalSales - totalRevenue;

  return {
    totalBills,
    totalCredit,
    totalSales,
    totalRevenue,
    totalDiscount,
    totalRevenueInCash,
    totalRevenueInUPI,
    totalRevenueInCredit
  };
});



const totalsExpense = computed(() => {
  const expenses = dashboard.value.expenses || [];

  const totalExpense = expenses.reduce((sum,expense) => sum + (expense.totalAmount ?? 0),0) ?? 0

  const totalExpensesInCash = expenses
    .filter(expense => expense.paymentMode === 'CASH')
    .reduce((sum, expense) => sum + (expense.totalAmount ?? 0), 0)

  const totalExpensesInUPI = expenses
    .filter(expense => expense.paymentMode === 'UPI')
    .reduce((sum, expense) => sum + (expense.totalAmount ?? 0), 0)
    
  return {
    totalExpense,
    totalExpensesInCash,
    totalExpensesInUPI,
  };
})

const kpiArray = computed<KpiItem[]>(() => ([
  { KPI: 'Total Revenue', Value: formatCurrency(dashboard.value.bills.reduce((sum,bill) => sum + (bill.grandTotal ?? 0),0) ?? 0) },
  { KPI: 'Total Bills', Value: dashboard.value.bills?.length },
  { KPI: 'Avg. Bill Value', Value: formatCurrency(dashboard.value.bills.length > 0 ? 
    totals.value.totalRevenue / dashboard.value.bills?.length : 0) }
]))

const billsCSV = computed(() => dashboard.value.bills.map(bill => {
  console.log(bill.invoiceNumber)
  const entryTaxSum = bill.entries?.reduce((sum, entry) => {
    const value = entry.value ?? 0
    const taxPercent = entry.tax ?? 0
    return sum + ((taxPercent / 100) * value)
  }, 0) ?? 0

  return {
    Invoice: `="${bill.invoiceNumber}"`,
    Date: bill.createdAt ? new Date(bill.createdAt).toLocaleDateString() : 'N/A',
    Client: bill.client?.name ?? 'N/A',
    Subtotal: bill.subtotal ?? 0,
    Tax: entryTaxSum, // ✅ accurate tax from entries
    Discount: bill.discount ?? 0,
    GrandTotal: bill.grandTotal ?? 0,
    PaymentMethod: bill.paymentMethod ?? 'N/A',
    Notes: bill.notes ?? '',
  }
}))

// Helper functions
const formatCurrency = (val: number) => `₹${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const formatAddress = (address?: any) => {
  if (!address) return 'N/A'
  return [
    address.name,
    address.street,
    address.locality,
    address.city,
    address.state,
    address.pincode
  ].filter(Boolean).join(', ')
}

// Download handlers
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const csvfilename = `sales-report-${timestamp}.csv`
const pdfFilename = `sales-report-${timestamp}.pdf`

const downloadCSV = () => {
  if (!dashboard.value.bills?.length) {
    toast.add({ title: 'No Data', description: 'No report data available to download', color: 'red' })
    return
  }
  
  csvLoading.value = true
  try {
    exportToCSV(billsCSV.value, csvfilename)
    toast.add({ title: 'CSV Downloaded', description: 'Your CSV file has been downloaded', color:'green' })
  } catch (error) {
    toast.add({ title: 'CSV Error', description: 'Failed to generate CSV', color: 'red' })
  } finally {
    csvLoading.value = false
  }
}

const downloadPDF = async () => {
  if (!dashboard.value.bills || !dashboard.value.bills?.length) {
    toast.add({ title: 'No Data', description: 'No report data available to export', color: 'red' })
    return
  }

  pdfLoading.value = true
  try {
    const { generateSalesReportPDF } = await import('~/utils/generate-sales-report-pdf.client')
    
    const reportMeta: PdfReportMeta = {
      companyName: 'Your Company Name',
      logoUrl: '/logo.png',
      dateRange: fullReport.value 
        ? 'Full Report' 
        : quickRange.value 
        ? quickRange.value 
        : `${selectedDate.value.start || 'Start'} to ${selectedDate.value.end || 'End'}`,
      reportTitle: 'Sales Report'
    }

    await generateSalesReportPDF(
      kpiArray.value,
      dashboard.value.bills,
      reportMeta,
      pdfFilename
    )
    
    toast.add({ title: 'PDF Downloaded', description: 'Your PDF report has been downloaded' })
  } catch (error) {
    console.error('PDF generation error:', error)
    toast.add({ 
      title: 'PDF Error', 
      description: 'Failed to generate PDF', 
      color: 'red' 
    })
  } finally {
    pdfLoading.value = false
  }
}

// Refresh function
const refreshPage = async () => {
  loading.value = true
  try {
    await fetchReportFromServer()
    toast.add({ title: 'Data refreshed successfully' })
  } catch (error) {
    console.error('Refresh failed:', error)
    toast.add({ title: 'Refresh Failed', description: 'Failed to reload data', color: 'red' })
  } finally {
    loading.value = false
  }
}

// Initialize
onMounted(() => {
  fetchReportFromServer()
})

const printReportHandle = async() => {
  try {
    printData = {
      companyName: useAuth().session.value?.companyName || '',
      companyAddress: dashboard.value.company?.address || {},
      expenses: dashboard.value.expenses || [],
      dateRange: selectedDate.value.start === selectedDate.value.end
        ? `${selectedDate.value.start || 'Start'}`
        : `${selectedDate.value.start || 'Start'} to ${selectedDate.value.end || 'End'}`,
      totalRevenue: totals.value.totalRevenue,
      totalRevenueInCash: totals.value.totalRevenueInCash,
      totalRevenueInUPI: totals.value.totalRevenueInUPI,
      totalExpense: totalsExpense.value.totalExpense,
      totalExpensesInUPI: totalsExpense.value.totalExpensesInUPI,
      totalExpensesInCash: totalsExpense.value.totalExpensesInCash,
      amountInUPI: totals.value.totalRevenueInUPI - totalsExpense.value.totalExpensesInUPI,
      amountInDrawer: totals.value.totalRevenueInCash - totalsExpense.value.totalExpensesInCash,
    }
    printReport(printData)
  } catch(err) {
    console.log(err)
  }
}
</script>


<template>
  <UDashboardPanelContent>
        <div v-if="loading" class="w-full flex justify-center items-center py-20">
        <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin w-5 h-5 text-gray-500 mr-2" />
        <span>Loading data...</span>
    </div>
    <div v-else ref="scrollContainer" class="scroll-container">
    <ClientOnly>
      <div class="space-y-6 p-6"  >
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 class="text-xl font-semibold">Sales Report</h1>
          <div class="flex flex-wrap items-center gap-3">
            <UPopover :popper="{ placement: 'bottom-start' }" class=" z-10 ">
              <UButton icon="i-heroicons-calendar-days-20-solid" class="w-full sm:w-60">
              {{ format(selectedDate.start, 'd MMM, yyy') }} - {{ format(selectedDate.end, 'd MMM, yyy') }}
              </UButton>

              <template #panel="{ close }">
              <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                  <div class="hidden sm:flex flex-col py-4">
                  <UButton
                      v-for="(range, index) in ranges"
                      :key="index"
                      :label="range.label"
                      color="gray"
                      variant="ghost"
                      class="rounded-none px-6 hidden sm:block"
                      :class="[isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
                      truncate
                      @click="selectRange(range.duration)"
                  />
                  </div>

                  <DatePicker v-model="selectedDate" @close="close" />
              </div>
              </template>
          </UPopover>
            <UButton 
              @click="downloadCSV" 
              icon="i-heroicons-arrow-down-tray" 
              :loading="csvLoading" 
              :disabled="isDownloadDisabled"
            >
              Download CSV
            </UButton>
            <UButton 
              @click="downloadPDF" 
              icon="i-heroicons-document" 
              :loading="pdfLoading" 
              :disabled="isDownloadDisabled"
            >
              Download PDF
            </UButton>
            <UButton 
              @click="printReportHandle" 
              icon="i-heroicons-document" 
              :loading="pdfLoading" 
              :disabled="isDownloadDisabled"
            >
             Print Report
            </UButton>
          </div>
        </div>

        <div v-if="!loading && dashboard" class="grid grid-cols-1 sm:grid-cols-5 gap-4">

            <UPopover mode="hover">
              <KpiCard class="w-full"  title="Total Revenue" :value="formatCurrency(totals.totalRevenue)"/> 
              <template #panel>
                <div class="p-4 flex flex-col">
                  <div>Revenue in Cash: {{ formatCurrency(totals?.totalRevenueInCash) }}</div>
                  <div>Revenue in UPI: {{ formatCurrency(totals?.totalRevenueInUPI) }}</div>
                </div>
            </template>
          </UPopover>

           <KpiCard class="w-full"  title="Total Credit" :value="formatCurrency(totals?.totalCredit)"/>

            <UPopover mode="hover">
              <KpiCard class="w-full" title="Total Expense" :value="formatCurrency(totalsExpense.totalExpense)"/>
              <template #panel>
                <div class="p-4 flex flex-col">
                  <div>Expense in Cash: {{ formatCurrency(totalsExpense.totalExpensesInCash) }}</div>
                  <div>Expense in UPI: {{ formatCurrency(totalsExpense.totalExpensesInUPI) }}</div>
                </div>
              </template>
            </UPopover>
      

            <UPopover mode="hover">
              <KpiCard class="w-full" title="Balance" :value="formatCurrency(totals.totalRevenue - totalsExpense.totalExpense)"/>
              <template #panel>
                <div class="p-4 flex flex-col">
                  <div>Balance in Cash: {{ formatCurrency(totals.totalRevenueInCash - totalsExpense.totalExpensesInCash) }}</div>
                  <div>Balance in UPI: {{ formatCurrency(totals.totalRevenueInUPI - totalsExpense.totalExpensesInUPI) }}</div>
                </div>
              </template>
            </UPopover>

              <KpiCard title="Profit" :value="formatCurrency(dashboard.totalProfit - totalsExpense.totalExpense) || 0.00"/>


        </div>


     <div class="flex flex-col lg:flex-row gap-4 h-[400px]">
  <!-- Table -->
  <div class="flex-1 bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4 overflow-auto">
    <UTable
      :rows="dashboard.categorySales"
      :columns="[
        { key: 'name', label: 'Category' },
        {
          key: 'sales',
          label: 'Sales',
        }
      ]"
    />
  </div>

  <!-- Top Products -->
  <div class="flex-1">
    <CategoryRevenuePie v-if="!loading && dashboard?.topProducts" :revenueByCategory="dashboard?.revenueByCategory" title="Category" />
  </div>
</div>


 <TopProducts
      v-if="!loading && dashboard?.topProducts"
      :topProducts="dashboard.topProducts"
    />

      </div>
    </ClientOnly>
  </div>
  </UDashboardPanelContent>
</template>
