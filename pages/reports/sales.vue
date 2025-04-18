<template>
  <UDashboardPanelContent>
    <ClientOnly>
      <div class="space-y-6 p-6">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 class="text-xl font-semibold">Sales Report</h1>
          <div class="flex flex-wrap items-center gap-3">
            <UInput v-model="startDate" type="date" placeholder="Start Date" class="w-40" :disabled="fullReport" />
            <UInput v-model="endDate" type="date" placeholder="End Date" class="w-40" :disabled="fullReport" />
            <UToggle v-model="fullReport" label="Full Report" />
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
          </div>
        </div>

        <div v-if="!loading && dashboard" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard title="Total Revenue" :value="formatCurrency(dashboard.totalRevenue.value)">
            <template #icon>
              <UIcon name="i-heroicons-banknotes" class="text-indigo-600 dark:text-white text-3xl" />
            </template>
          </KpiCard>
          <KpiCard title="Total Bills" :value="filteredBills.length">
            <template #icon>
              <UIcon name="i-heroicons-receipt-refund" class="text-indigo-600 dark:text-white text-3xl" />
            </template>
          </KpiCard>
          <KpiCard 
            title="Avg. Bill Value" 
            :value="formatCurrency(filteredBills.length > 0 ? dashboard.totalRevenue.value / filteredBills.length : 0)"
          >
            <template #icon>
              <UIcon name="i-heroicons-chart-bar" class="text-indigo-600 dark:text-white text-3xl" />
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

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import TopProducts from '@/components/dashboard/TopProducts.vue'
import RevenueEChart from '@/components/dashboard/RevenueEChart.vue'
import { useCompanyDashboard } from '@/lib/api/useDashboardData'
import { exportToCSV } from '~/utils/export-csv'
import type { DashboardComposable, BillWithRelations, KpiItem, PdfReportMeta } from '~/types/dashboard'

// Refs
const loading = ref(true)
const dashboard = useCompanyDashboard() as DashboardComposable
const startDate = ref('')
const endDate = ref('')
const fullReport = ref(false)
const quickRange = ref('')
const quickRanges = ['This Month', 'Last Month']
const csvLoading = ref(false)
const pdfLoading = ref(false)
const toast = useToast()

// Set default date range (current month)
const setDefaultDateRange = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  startDate.value = new Date(year, month, 1).toISOString().split('T')[0]
  endDate.value = new Date(year, month + 1, 0).toISOString().split('T')[0]
}

// Computed properties
const isDownloadDisabled = computed(() => {
  return loading.value || !dashboard.bills.value || 
    (!fullReport.value && !startDate.value && !endDate.value && !quickRange.value)
})

const filteredBills = computed(() => {
  if (!dashboard.bills.value || !dashboard.bills.value.length) return []
  
  if (fullReport.value) return dashboard.bills.value
  
  const start = startDate.value ? new Date(startDate.value) : null
  const end = endDate.value ? new Date(endDate.value) : null
  
  return dashboard.bills.value.filter(b => {
    const billDate = new Date(b.createdAt)
    return (!start || billDate >= start) && (!end || billDate <= end)
  })
})

const kpiArray = computed<KpiItem[]>(() => ([
  { KPI: 'Total Revenue', Value: formatCurrency(dashboard.totalRevenue.value || 0) },
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
  
  if (value === 'This Month') {
    startDate.value = new Date(year, month, 1).toISOString().split('T')[0]
    endDate.value = new Date(year, month + 1, 0).toISOString().split('T')[0]
  } else if (value === 'Last Month') {
    startDate.value = new Date(year, month - 1, 1).toISOString().split('T')[0]
    endDate.value = new Date(year, month, 0).toISOString().split('T')[0]
  }
})

// Initialize
onMounted(() => {
  setDefaultDateRange()
  // Data is automatically loaded by the composable
  loading.value = false
})
</script>