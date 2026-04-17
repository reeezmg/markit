<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { format, startOfDay, endOfDay, isSameDay, sub, type Duration } from 'date-fns'

/* =========================
   STATE — SHARED
========================= */

const selectedDate = ref({ start: new Date(), end: new Date() })
const activeTab = ref(0)

const auth = useNuxtApp().$auth
const toast = useToast()

/* =========================
   STATE — PER REPORT
========================= */

const gstr1 = ref<any>(null)
const loading1 = ref(false)
const excelLoading1 = ref(false)

const gstr3b = ref<any>(null)
const loading3b = ref(false)
const excelLoading3b = ref(false)

const gstr2b = ref<any>(null)
const loading2b = ref(false)
const excelLoading2b = ref(false)

/* =========================
   DATE HELPERS
========================= */

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

function isRangeSelected(duration: Duration) {
  return (
    isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
  )
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

/* =========================
   FORMATTERS
========================= */

const formatCurrency = (val: number | string) =>
  `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* =========================
   DATE PARAMS
========================= */

const dateParams = computed(() => ({
  startDate: startOfDay(selectedDate.value.start).toISOString(),
  endDate: endOfDay(selectedDate.value.end).toISOString()
}))

/* =========================
   GSTR-1 FETCH & DOWNLOAD
========================= */

const fetchGstr1 = async () => {
  loading1.value = true
  try {
    gstr1.value = await $fetch('/api/report/gstr1', { query: dateParams.value })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to load GSTR-1', color: 'red' })
  } finally {
    loading1.value = false
  }
}

const downloadGstr1Excel = async () => {
  excelLoading1.value = true
  try {
    const res = await $fetch.raw('/api/report/generate-gstr1.excel', {
      method: 'GET',
      params: dateParams.value,
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    })
    const blob = new Blob([res._data as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'gstr1.xlsx'
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({ title: 'Excel Error', description: 'Failed to download GSTR-1', color: 'red' })
  } finally {
    excelLoading1.value = false
  }
}

/* =========================
   GSTR-3B FETCH & DOWNLOAD
========================= */

const fetchGstr3b = async () => {
  loading3b.value = true
  try {
    gstr3b.value = await $fetch('/api/report/gstr3b', { query: dateParams.value })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to load GSTR-3B', color: 'red' })
  } finally {
    loading3b.value = false
  }
}

const downloadGstr3bExcel = async () => {
  excelLoading3b.value = true
  try {
    const res = await $fetch.raw('/api/report/generate-gstr3b.excel', {
      method: 'GET',
      params: dateParams.value,
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    })
    const blob = new Blob([res._data as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'gstr3b.xlsx'
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({ title: 'Excel Error', description: 'Failed to download GSTR-3B', color: 'red' })
  } finally {
    excelLoading3b.value = false
  }
}

/* =========================
   GSTR-2B FETCH & DOWNLOAD
========================= */

const fetchGstr2b = async () => {
  loading2b.value = true
  try {
    gstr2b.value = await $fetch('/api/report/gstr2b', { query: dateParams.value })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to load GSTR-2B', color: 'red' })
  } finally {
    loading2b.value = false
  }
}

const downloadGstr2bExcel = async () => {
  excelLoading2b.value = true
  try {
    const res = await $fetch.raw('/api/report/generate-gstr2b.excel', {
      method: 'GET',
      params: dateParams.value,
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    })
    const blob = new Blob([res._data as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'gstr2b.xlsx'
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({ title: 'Excel Error', description: 'Failed to download GSTR-2B', color: 'red' })
  } finally {
    excelLoading2b.value = false
  }
}

/* =========================
   WATCHERS
========================= */

// On date change, re-fetch whichever tab is active
watch(selectedDate, () => {
  if (activeTab.value === 0) fetchGstr1()
  else if (activeTab.value === 1) fetchGstr3b()
  else fetchGstr2b()
})

// On tab switch, lazy-load if not yet fetched
watch(activeTab, (tab) => {
  if (tab === 0 && !gstr1.value) fetchGstr1()
  else if (tab === 1 && !gstr3b.value) fetchGstr3b()
  else if (tab === 2 && !gstr2b.value) fetchGstr2b()
})

onMounted(() => fetchGstr1())

/* =========================
   TABS
========================= */

const tabs = [
  { label: 'GSTR-1' },
  { label: 'GSTR-3B' },
  { label: 'GSTR-2B' }
]

/* =========================
   COLUMN DEFINITIONS
========================= */

const rateSummaryCols = [
  { key: 'taxRate', label: 'Tax Rate (%)' },
  { key: 'taxableValue', label: 'Taxable Value' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'igst', label: 'IGST' },
  { key: 'totalTax', label: 'Total Tax' }
]

const hsnCols = [
  { key: 'hsnCode', label: 'HSN Code' },
  { key: 'description', label: 'Description' },
  { key: 'uom', label: 'UOM' },
  { key: 'totalQty', label: 'Qty' },
  { key: 'taxableValue', label: 'Taxable Value' },
  { key: 'taxRate', label: 'Rate (%)' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'totalTax', label: 'Total Tax' }
]

const outwardCols = [
  { key: 'description', label: 'Description' },
  { key: 'taxableValue', label: 'Taxable Value' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'totalTax', label: 'Total Tax' }
]

const itcCols = [
  { key: 'description', label: 'Description' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'total', label: 'Total' }
]

const rateItcCols = [
  { key: 'taxRate', label: 'Tax Rate (%)' },
  { key: 'taxableValue', label: 'Taxable Value' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'total', label: 'Total' }
]

const distributorCols = [
  { key: 'name', label: 'Distributor' },
  { key: 'invoiceCount', label: 'Invoice Count' },
  { key: 'taxableValue', label: 'Taxable Value' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'totalTax', label: 'Total Tax' }
]

/* =========================
   COMPUTED TABLE ROWS
========================= */

const table31Rows = computed(() => {
  if (!gstr3b.value) return []
  return [
    {
      description: 'Outward taxable supplies',
      taxableValue: gstr3b.value.outwardTaxable.taxableValue,
      cgst: gstr3b.value.outwardTaxable.cgst,
      sgst: gstr3b.value.outwardTaxable.sgst,
      totalTax: gstr3b.value.outwardTaxable.totalTax
    },
    {
      description: 'Nil rated / Exempt',
      taxableValue: gstr3b.value.nilRated.taxableValue,
      cgst: 0,
      sgst: 0,
      totalTax: 0
    }
  ]
})

const table4Rows = computed(() => {
  if (!gstr3b.value) return []
  return [
    {
      description: 'ITC Available (Inward Supplies)',
      cgst: gstr3b.value.itc.cgst,
      sgst: gstr3b.value.itc.sgst,
      total: gstr3b.value.itc.totalItc
    }
  ]
})
</script>

<template>
  <UDashboardPanelContent>
    <div class="p-6 space-y-6">

      <!-- ================= HEADER ================= -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold">GST Returns</h2>
          <p class="text-sm text-gray-500 mt-0.5">View and download GSTR-1, GSTR-3B, and GSTR-2B data</p>
        </div>

        <!-- Date Picker -->
        <UPopover :popper="{ placement: 'bottom-end' }" class="z-10">
          <UButton icon="i-heroicons-calendar-days-20-solid" color="white" class="w-full sm:w-64 justify-start">
            {{ format(selectedDate.start, 'd MMM yyyy') }}
            –
            {{ format(selectedDate.end, 'd MMM yyyy') }}
          </UButton>

          <template #panel="{ close }">
            <div class="flex sm:divide-x divide-gray-200">
              <div class="hidden sm:flex flex-col py-4">
                <UButton
                  v-for="(range, index) in ranges"
                  :key="index"
                  :label="range.label"
                  :color="isRangeSelected(range.duration) ? 'primary' : 'gray'"
                  variant="ghost"
                  class="rounded-none px-6"
                  @click="selectRange(range.duration)"
                />
              </div>
              <DatePicker v-model="selectedDate" @close="close" />
            </div>
          </template>
        </UPopover>
      </div>

      <!-- ================= TABS ================= -->
      <UTabs :items="tabs" v-model="activeTab">

        <template #item="{ index }">

          <!-- ==================== GSTR-1 TAB ==================== -->
          <div v-if="index === 0" class="pt-4 space-y-6">

            <!-- Export button -->
            <div class="flex justify-end">
              <UButton
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                :loading="excelLoading1"
                @click="downloadGstr1Excel"
              >
                Download Excel
              </UButton>
            </div>

            <!-- Loading -->
            <div v-if="loading1" class="flex justify-center items-center py-20">
              <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin w-5 h-5 text-gray-500 mr-2" />
              <span>Loading GSTR-1...</span>
            </div>

            <template v-else-if="gstr1">

              <!-- KPI Cards -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <UCard>
                  <div class="text-sm text-gray-500">Total Taxable Value</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr1.kpi.totalTaxableValue) }}</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">Total Tax</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr1.kpi.totalTax) }}</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">Total Invoice Value</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr1.kpi.totalInvoiceValue) }}</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">Bill Count</div>
                  <div class="text-xl font-semibold mt-1">{{ gstr1.kpi.billCount }}</div>
                </UCard>
              </div>

              <!-- Rate-wise Summary -->
              <UCard>
                <h3 class="font-semibold mb-3">Rate-wise Summary (B2CS)</h3>
                <UTable :rows="gstr1.rateSummary" :columns="rateSummaryCols">
                  <template #taxableValue-data="{ row }">{{ formatCurrency(row.taxableValue) }}</template>
                  <template #cgst-data="{ row }">{{ formatCurrency(row.cgst) }}</template>
                  <template #sgst-data="{ row }">{{ formatCurrency(row.sgst) }}</template>
                  <template #igst-data="{ row }">{{ formatCurrency(row.igst) }}</template>
                  <template #totalTax-data="{ row }">{{ formatCurrency(row.totalTax) }}</template>
                </UTable>
              </UCard>

              <!-- HSN Summary -->
              <UCard>
                <h3 class="font-semibold mb-3">HSN Summary</h3>
                <UTable :rows="gstr1.hsnSummary" :columns="hsnCols">
                  <template #taxableValue-data="{ row }">{{ formatCurrency(row.taxableValue) }}</template>
                  <template #cgst-data="{ row }">{{ formatCurrency(row.cgst) }}</template>
                  <template #sgst-data="{ row }">{{ formatCurrency(row.sgst) }}</template>
                  <template #totalTax-data="{ row }">{{ formatCurrency(row.totalTax) }}</template>
                </UTable>
              </UCard>

            </template>
          </div>

          <!-- ==================== GSTR-3B TAB ==================== -->
          <div v-else-if="index === 1" class="pt-4 space-y-6">

            <!-- Export button -->
            <div class="flex justify-end">
              <UButton
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                :loading="excelLoading3b"
                @click="downloadGstr3bExcel"
              >
                Download Excel
              </UButton>
            </div>

            <!-- Loading -->
            <div v-if="loading3b" class="flex justify-center items-center py-20">
              <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin w-5 h-5 text-gray-500 mr-2" />
              <span>Loading GSTR-3B...</span>
            </div>

            <template v-else-if="gstr3b">

              <!-- Table 3.1 -->
              <UCard>
                <h3 class="font-semibold mb-3">Table 3.1 — Outward Taxable Supplies</h3>
                <UTable :rows="table31Rows" :columns="outwardCols">
                  <template #taxableValue-data="{ row }">{{ formatCurrency(row.taxableValue) }}</template>
                  <template #cgst-data="{ row }">{{ formatCurrency(row.cgst) }}</template>
                  <template #sgst-data="{ row }">{{ formatCurrency(row.sgst) }}</template>
                  <template #totalTax-data="{ row }">{{ formatCurrency(row.totalTax) }}</template>
                </UTable>
              </UCard>

              <!-- Table 4 — ITC -->
              <UCard>
                <h3 class="font-semibold mb-3">Table 4 — Input Tax Credit (ITC)</h3>
                <UTable :rows="table4Rows" :columns="itcCols">
                  <template #cgst-data="{ row }">{{ formatCurrency(row.cgst) }}</template>
                  <template #sgst-data="{ row }">{{ formatCurrency(row.sgst) }}</template>
                  <template #total-data="{ row }">{{ formatCurrency(row.total) }}</template>
                </UTable>
              </UCard>

              <!-- Net Payable -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UCard>
                  <div class="text-sm text-gray-500">Net CGST Payable</div>
                  <div class="text-xl font-semibold mt-1 text-primary-600">
                    {{ formatCurrency(gstr3b.netPayable.cgst) }}
                  </div>
                  <div class="text-xs text-gray-400 mt-1">CGST collected – ITC CGST</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">Net SGST Payable</div>
                  <div class="text-xl font-semibold mt-1 text-primary-600">
                    {{ formatCurrency(gstr3b.netPayable.sgst) }}
                  </div>
                  <div class="text-xs text-gray-400 mt-1">SGST collected – ITC SGST</div>
                </UCard>
              </div>

            </template>
          </div>

          <!-- ==================== GSTR-2B TAB ==================== -->
          <div v-else-if="index === 2" class="pt-4 space-y-6">

            <!-- Export button -->
            <div class="flex justify-end">
              <UButton
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                :loading="excelLoading2b"
                @click="downloadGstr2bExcel"
              >
                Download Excel
              </UButton>
            </div>

            <!-- Loading -->
            <div v-if="loading2b" class="flex justify-center items-center py-20">
              <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin w-5 h-5 text-gray-500 mr-2" />
              <span>Loading GSTR-2B...</span>
            </div>

            <template v-else-if="gstr2b">

              <!-- KPI Cards -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <UCard>
                  <div class="text-sm text-gray-500">Total ITC Available</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr2b.kpi.totalItc) }}</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">CGST ITC</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr2b.kpi.cgst) }}</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">SGST ITC</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr2b.kpi.sgst) }}</div>
                </UCard>
                <UCard>
                  <div class="text-sm text-gray-500">Total Inward Value</div>
                  <div class="text-xl font-semibold mt-1">{{ formatCurrency(gstr2b.kpi.totalInwardValue) }}</div>
                </UCard>
              </div>

              <!-- Rate-wise ITC -->
              <UCard>
                <h3 class="font-semibold mb-3">Rate-wise ITC</h3>
                <UTable :rows="gstr2b.rateSummary" :columns="rateItcCols">
                  <template #taxableValue-data="{ row }">{{ formatCurrency(row.taxableValue) }}</template>
                  <template #cgst-data="{ row }">{{ formatCurrency(row.cgst) }}</template>
                  <template #sgst-data="{ row }">{{ formatCurrency(row.sgst) }}</template>
                  <template #total-data="{ row }">{{ formatCurrency(row.total) }}</template>
                </UTable>
              </UCard>

              <!-- Distributor-wise -->
              <UCard>
                <h3 class="font-semibold mb-3">Distributor-wise Summary</h3>
                <UTable :rows="gstr2b.distributorSummary" :columns="distributorCols">
                  <template #taxableValue-data="{ row }">{{ formatCurrency(row.taxableValue) }}</template>
                  <template #cgst-data="{ row }">{{ formatCurrency(row.cgst) }}</template>
                  <template #sgst-data="{ row }">{{ formatCurrency(row.sgst) }}</template>
                  <template #totalTax-data="{ row }">{{ formatCurrency(row.totalTax) }}</template>
                </UTable>
              </UCard>

            </template>
          </div>

        </template>

      </UTabs>

    </div>
  </UDashboardPanelContent>
</template>
