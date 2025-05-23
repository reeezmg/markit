<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import TopProducts from '@/components/dashboard/TopProducts.vue'
import RevenueEChart from '@/components/dashboard/RevenueEChart.vue'
import { useCompanyDashboard } from '@/lib/api/useDashboardData'
import { exportToCSV } from '~/utils/export-csv'
import type { DashboardComposable, BillWithRelations, KpiItem, PdfReportMeta } from '~/types/dashboard'

// Refs
const useAuth = () => useNuxtApp().$auth;
const loading = ref(true)
const { printReport } = usePrint();
let printData = {}
const dashboard = useCompanyDashboard() as DashboardComposable
const startDate = ref('')
const endDate = ref('')
const fullReport = ref(false)
const quickRange = ref('Today')
const quickRanges = ['Today','This Month', 'Last Month']
const csvLoading = ref(false)
const pdfLoading = ref(false)
const toast = useToast()

// Set default date range (current month)
const setDefaultDateRange = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.toLocaleDateString('en-CA')
    startDate.value = today
    endDate.value = today
}

// Computed properties
const isDownloadDisabled = computed(() => {
  return loading.value || !dashboard.bills.value || 
    (!fullReport.value && !startDate.value && !endDate.value && !quickRange.value)
})

const filteredBills = computed(() => {
  if (!dashboard.bills.value || !dashboard.bills.value.length) return [];

  if (fullReport.value) return dashboard.bills.value;

  const start = startDate.value
    ? new Date(new Date(startDate.value).setHours(0, 0, 0, 0))
    : null;

  const end = endDate.value
    ? new Date(new Date(endDate.value).setHours(23, 59, 59, 999))
    : null;

  return dashboard.bills.value.filter(b => {
    const billDate = new Date(b.createdAt);
    return (!start || billDate >= start) && (!end || billDate <= end);
  });
});


const totals = computed(() => {
  const bills = filteredBills.value;

  const totalBills = bills.length;
         {paymentStatus:'PAID'}

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



const filteredExpenses = computed(() => {
  if (!dashboard.expenses.value || !dashboard.expenses.value.length) return []
  
  if (fullReport.value) return dashboard.expenses.value
  
  const start = startDate.value
    ? new Date(new Date(startDate.value).setHours(0, 0, 0, 0))
    : null;

  const end = endDate.value
    ? new Date(new Date(endDate.value).setHours(23, 59, 59, 999))
    : null;

  return dashboard.expenses.value.filter(b => {
    const billDate = new Date(b.expenseDate)
    return (!start || billDate >= start) && (!end || billDate <= end)
  })
})

const totalsExpense = computed(() => {
     const expenses = filteredExpenses.value;

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
  { KPI: 'Total Revenue', Value: formatCurrency(filteredBills.value.reduce((sum,bill) => sum + (bill.grandTotal ?? 0),0) ?? 0) },
  { KPI: 'Total Bills', Value: filteredBills.value.length },
  { KPI: 'Avg. Bill Value', Value: formatCurrency(filteredBills.value.length > 0 ? 
    (dashboard.totalRevenue.value || 0) / filteredBills.value.length : 0) }
]))

const billsCSV = computed(() => filteredBills.value.map(bill => ({
  Invoice: bill.invoiceNumber ?? '-',
  Date: bill.createdAt ? new Date(bill.createdAt).toLocaleDateString() : 'N/A',
  Client: bill.client?.name ?? 'N/A',
  Address: formatAddress(bill.address),
  Subtotal: bill.subtotal ?? 0,
  Tax: bill.tax ?? 0,
  Discount: bill.discount ?? 0,
  GrandTotal: bill.grandTotal ?? 0,
  PaymentStatus: bill.paymentStatus,
  PaymentMethod: bill.paymentMethod ?? 'N/A',
  TransactionID: bill.transactionId ?? '-',
  Notes: bill.notes ?? ''
})))

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
  if (!filteredBills.value.length) {
    toast.add({ title: 'No Data', description: 'No report data available to download', color: 'red' })
    return
  }
  
  csvLoading.value = true
  try {
    exportToCSV(billsCSV.value, csvfilename)
    toast.add({ title: 'CSV Downloaded', description: 'Your CSV file has been downloaded' })
  } catch (error) {
    toast.add({ title: 'CSV Error', description: 'Failed to generate CSV', color: 'red' })
  } finally {
    csvLoading.value = false
  }
}

const downloadPDF = async () => {
  if (!dashboard.bills.value || !filteredBills.value.length) {
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
        : `${startDate.value || 'Start'} to ${endDate.value || 'End'}`,
      reportTitle: 'Sales Report'
    }

    await generateSalesReportPDF(
      kpiArray.value,
      filteredBills.value,
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
    await dashboard.refreshAll()
    toast.add({ title: 'Data refreshed successfully' })
  } catch (error) {
    console.error('Refresh failed:', error)
    toast.add({ title: 'Refresh Failed', description: 'Failed to reload data', color: 'red' })
  } finally {
    loading.value = false
  }
}

// Watch for quick range changes
watch(quickRange, (value) => {
  if (!value) return

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  if (value === 'Today') {
    const today = now.toLocaleDateString('en-CA')
    startDate.value = today
    endDate.value = today
  } else if (value === 'This Month') {
    startDate.value = new Date(year, month, 1).toLocaleDateString('en-CA')
    endDate.value = new Date(year, month + 1, 0).toLocaleDateString('en-CA')
  } else if (value === 'Last Month') {
    startDate.value = new Date(year, month - 1, 1).toLocaleDateString('en-CA')
    endDate.value = new Date(year, month, 0).toLocaleDateString('en-CA')
  }
})


// Initialize
onMounted(() => {
  setDefaultDateRange()
  // Data is automatically loaded by the composable
  loading.value = false
})

const printReportHandle = async() => {
  try{
    printData = {
      companyName: useAuth().session.value?.companyName || '',
       companyAddress: dashboard.company.value.address || {},
       expenses: filteredExpenses.value || [],
       dateRange: startDate.value === endDate.value
        ? `${startDate.value || 'Start'}`
        : `${startDate.value || 'Start'} to ${endDate.value || 'End'}`,
        totalRevenue:totals.value.totalRevenue,
        totalRevenueInCash:totals.value.totalRevenueInCash,
        totalRevenueInUPI:totals.value.totalRevenueInUPI,
        totalExpense:totalsExpense.value.totalExpense,
        totalExpensesInUPI:totalsExpense.value.totalExpensesInUPI,
        totalExpensesInCash:totalsExpense.value.totalExpensesInCash,
        amountInUPI:totals.value.totalRevenueInUPI - totalsExpense.value.totalExpensesInUPI,
        amountInDrawer:totals.value.totalRevenueInCash - totalsExpense.value.totalExpensesInCash,
    }
    printReport(printData)
console.log(printData)
  }catch(err){
console.log(err)
  }
}
</script>


<template>
  <UDashboardPanelContent>
    <ClientOnly>
      <div class="space-y-6 p-6">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 class="text-xl font-semibold">Sales Report</h1>
          <div class="flex flex-wrap items-center gap-3">
            <UInput v-model="startDate" type="date" placeholder="Start Date" class="w-40" :disabled="fullReport" />
            <UInput v-model="endDate" type="date" placeholder="End Date" class="w-40" :disabled="fullReport" />
            <!-- <UToggle v-model="fullReport" label="Full Report" /> -->
            <USelectMenu
              v-model="quickRange"
              :options="quickRanges"
              placeholder="Quick Ranges"
              class="w-40"
              :disabled="fullReport"
            />
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
            <KpiCard class="w-full"  title="Total Revenue" :value="formatCurrency(totals.totalRevenue)">
              <template #icon>
                <UIcon name="i-heroicons-banknotes" class="text-indigo-600 dark:text-white text-3xl" />
              </template>
            </KpiCard>

           
            <template #panel>
            <div class="p-4 flex flex-col">
              <div>Revenue in Cash: {{ totals.totalRevenueInCash }}</div>
              <div>Revenue in UPI: {{ totals.totalRevenueInUPI }}</div>
            </div>
          </template>
          </UPopover>

           <KpiCard class="w-full"  title="Total Credit" :value="formatCurrency(totals.totalCredit)">
              <template #icon>
                <UIcon name="i-heroicons-banknotes" class="text-indigo-600 dark:text-white text-3xl" />
              </template>
            </KpiCard>


            <UPopover mode="hover">
            <KpiCard class="w-full" title="Total Expense" :value="formatCurrency(totalsExpense.totalExpense)">
            <template #icon>
              <UIcon name="i-heroicons-banknotes" class="text-indigo-600 dark:text-white text-3xl" />
            </template>
          </KpiCard>
           <template #panel>
            <div class="p-4 flex flex-col">
              <div>Expense in Cash: {{ totalsExpense.totalExpensesInCash }}</div>
              <div>Expense in UPI: {{ totalsExpense.totalExpensesInUPI }}</div>
            </div>
          </template>
        </UPopover>
        

            <KpiCard title="Amount in Drawer" :value="formatCurrency(totals.totalRevenueInCash - totalsExpense.totalExpensesInCash)">
              <template #icon>
                <UIcon name="i-heroicons-banknotes" class="text-indigo-600 dark:text-white text-3xl" />
              </template>
            </KpiCard>

              <KpiCard title="Amount in Bank" :value="formatCurrency(totals.totalRevenueInUPI - totalsExpense.totalExpensesInUPI)">
              <template #icon>
                <UIcon name="i-heroicons-banknotes" class="text-indigo-600 dark:text-white text-3xl" />
              </template>
            </KpiCard>
        </div>

        <TopProducts v-if="!loading && dashboard?.topProducts" :products="dashboard.topProducts" />
        <RevenueEChart v-if="!loading && dashboard?.revenueGraph" :data="dashboard.revenueGraph" title="Monthly Sales Overview" />

        <div v-if="loading" class="text-center py-6">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin h-6 w-6 mx-auto" />
          <p class="mt-2">Loading report data...</p>
        </div>

        <div v-if="!loading && !filteredBills.length" class="text-center py-6">
          <UIcon name="i-heroicons-exclamation-circle" class="h-8 w-8 text-red-500 mx-auto" />
          <p class="text-red-500 mt-2">No data available for this report</p>
          <p class="text-sm text-gray-500 mt-1">
            {{ (dashboard.bills.value?.length ?? 0) > 0 ? 'Filters may be too restrictive' : 'No bills found' }}
          </p>
          <UButton 
            icon="i-heroicons-arrow-path" 
            @click="refreshPage" 
            class="mt-4"
            :loading="loading"
          >
            Retry
          </UButton>
        </div>
      </div>
    </ClientOnly>
  </UDashboardPanelContent>
</template>
