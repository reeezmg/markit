<script setup lang="ts">

import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'

const billStore = useBillStore()
const onlineTableStore = useOnlineTableStore()
const toast = useToast()
const router = useRouter()
const useAuth = () => useNuxtApp().$auth
const isMobile = ref(false)

const { printBill } = usePrint()
const printData = ref(null)
const isPrintOpen = ref(false)

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

const selectedDate = ref({ start: new Date(), end: new Date() })

const getColumns = (isMobile) => {
  if (!isMobile) {
    return [
      { key: 'invoiceNumber', label: 'Inv#', sortable: true },
      { key: 'createdAt', label: 'Date', sortable: true },
      { key: 'customer', label: 'Customer', sortable: true },
      { key: 'subtotal', label: 'Sub Total', sortable: true },
      { key: 'grandTotal', label: 'Grand Total', sortable: true },
      { key: 'notes', label: 'Notes', sortable: true },
      { key: 'actions', label: 'Actions', sortable: false },
    ]
  }
  return [
    { key: 'invoiceNumber', label: 'Inv#', sortable: true },
    { key: 'grandTotal', label: 'Grand Total', sortable: true },
    { key: 'createdAt', label: 'Date', sortable: true },
    { key: 'customer', label: 'Customer', sortable: true },
    { key: 'notes', label: 'Notes', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false },
  ]
}

const columns = computed(() => getColumns(isMobile.value))

const entrycolumns = [
  { key: 'barcode', label: 'Barcode', sortable: true },
  { key: 'category.name', label: 'Category', sortable: true },
  { key: 'name', label: 'Name', sortable: true },
  { key: 'rate', label: 'Rate', sortable: true },
  { key: 'qty', label: 'Quantity', sortable: true },
  { key: 'discount', label: 'Discount', sortable: true },
  { key: 'tax', label: 'Tax', sortable: true },
  { key: 'value', label: 'Value', sortable: true },
]

const action = (row: any) => [
  [
    {
      label: 'Open',
      icon: 'i-heroicons-eye-20-solid',
      click: () => router.push(`./edit/${row.id}`),
    },
  ],
  [
    {
      label: 'Details',
      icon: 'i-heroicons-document-magnifying-glass',
      click: () => openBill(row.id),
    },
  ],
]

const selectedColumns = ref([])
watch(columns, (newColumns) => {
  selectedColumns.value = [...newColumns]
}, { immediate: true })
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))
const columnsTable = computed(() => columns.value.filter((column) => selectedColumns.value.includes(column)))

const selectedRows = ref([])
const notes = ref<any>({})
const search = ref('')
const selectedStatus = ref<any>([])
const minGrandTotal = ref<number | null>(null)
const maxGrandTotal = ref<number | null>(null)
const isFilterModalOpen = ref(false)
const draftSelectedStatus = ref<any>([])
const draftMinGrandTotal = ref<number | null>(null)
const draftMaxGrandTotal = ref<number | null>(null)

const todoStatus = [
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING' },
]

const resetFilters = () => {
  search.value = ''
  selectedStatus.value = []
  minGrandTotal.value = null
  maxGrandTotal.value = null
  selectedDate.value = { start: new Date(), end: new Date() }
}

const formatCurrency = (val: number) =>
  '₹' + Number(val ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Report totals (commission, balance)
const reportTotals = ref<{
  totalSales: number
  totalCommission: number
  billCount: number
} | null>(null)

const fetchTotals = async () => {
  try {
    reportTotals.value = await $fetch('/api/report/online', {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start),
        endDate: endOfDay(selectedDate.value.end),
      },
    })
  } catch {}
}

const kpiCards = computed(() => {
  const totalSales = reportTotals.value?.totalSales ?? 0
  const commission = reportTotals.value?.totalCommission ?? 0
  return [
    {
      label: 'Total Bills',
      value: String(reportTotals.value?.billCount ?? 0),
      icon: 'i-heroicons-document-text',
      accent: 'border-l-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Total Sales',
      value: formatCurrency(totalSales),
      icon: 'i-heroicons-banknotes',
      accent: 'border-l-primary-500',
      textColor: 'text-primary-600 dark:text-primary-400',
    },
    {
      label: 'Commission',
      value: formatCurrency(commission),
      icon: 'i-heroicons-receipt-percent',
      accent: 'border-l-orange-500',
      textColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Balance',
      value: formatCurrency(totalSales - commission),
      icon: 'i-heroicons-currency-rupee',
      accent: 'border-l-green-500',
      textColor: 'text-green-600 dark:text-green-400',
    },
  ]
})

// Pagination / table
const sort = ref({ column: 'invoiceNumber', direction: 'desc' as const })
const expand = ref({ openedRows: [], row: null })
const page = ref(1)
const pageCount = ref('5')
const sales = ref([])
const pageTotal = ref(0)
const isLoading = ref(false)
const lastFetchId = ref(0)

const fetchSales = async () => {
  isLoading.value = true
  const fetchId = ++lastFetchId.value
  try {
    const res = await $fetch('/api/billSale/findManyBills', {
      method: 'POST',
      body: {
        companyId: useAuth().session.value?.companyId,
        search: search.value?.trim(),
        selectedStatus: selectedStatus.value,
        minGrandTotal: minGrandTotal.value,
        maxGrandTotal: maxGrandTotal.value,
        startDate: startOfDay(selectedDate.value?.start).toISOString(),
        endDate: endOfDay(selectedDate.value?.end).toISOString(),
        page: page.value,
        pageCount: Number(pageCount.value),
        sortColumn: sort.value.column,
        sortDirection: sort.value.direction,
        isMarkitOnly: true,
      },
    })
    if (fetchId !== lastFetchId.value) return
    sales.value = res.rows
    pageTotal.value = res.total
  } catch {
    if (fetchId !== lastFetchId.value) return
    sales.value = []
    pageTotal.value = 0
  } finally {
    if (fetchId === lastFetchId.value) isLoading.value = false
  }
}

const fetchAll = async () => {
  await Promise.all([fetchSales(), fetchTotals()])
}

const styledSales = computed(() =>
  (sales.value || []).map(row => ({
    ...row,
    class: row.precedence ? 'bg-red-50 text-red-600' : undefined
  }))
)

watch(sales, () => {
  if (page.value > pageTotal.value) page.value = 1
})

watch(
  [
    page, pageCount, search, selectedStatus,
    minGrandTotal, maxGrandTotal,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
    () => sort.value.column,
    () => sort.value.direction,
  ],
  fetchSales
)

watch(
  [
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
  ],
  fetchTotals
)

watch(
  [
    search, selectedStatus, minGrandTotal, maxGrandTotal, pageCount,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
  ],
  () => { if (page.value !== 1) page.value = 1 },
  { deep: true }
)

watch(
  [
    search, selectedStatus, minGrandTotal, maxGrandTotal,
    page, pageCount,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
    () => sort.value.column,
    () => sort.value.direction,
    selectedColumnKeys,
  ],
  () => {
    onlineTableStore.$patch({
      search: search.value,
      selectedStatus: selectedStatus.value,
      minGrandTotal: minGrandTotal.value,
      maxGrandTotal: maxGrandTotal.value,
      selectedDate: selectedDate.value
        ? { start: new Date(selectedDate.value.start).toISOString(), end: new Date(selectedDate.value.end).toISOString() }
        : null,
      page: page.value,
      pageCount: pageCount.value,
      sort: sort.value,
      selectedColumnKeys: selectedColumnKeys.value,
    })
  },
  { deep: true }
)

const openFilterModal = () => {
  draftSelectedStatus.value = [...selectedStatus.value]
  draftMinGrandTotal.value = minGrandTotal.value
  draftMaxGrandTotal.value = maxGrandTotal.value
  isFilterModalOpen.value = true
}

const applyFilters = async () => {
  selectedStatus.value = [...draftSelectedStatus.value]
  minGrandTotal.value = draftMinGrandTotal.value
  maxGrandTotal.value = draftMaxGrandTotal.value
  page.value = 1
  isFilterModalOpen.value = false
  await fetchAll()
}

onMounted(() => {
  {
    const saved = onlineTableStore
    search.value = saved.search ?? ''
    selectedStatus.value = saved.selectedStatus ?? []
    minGrandTotal.value = saved.minGrandTotal ?? null
    maxGrandTotal.value = saved.maxGrandTotal ?? null
    if (saved.selectedDate?.start && saved.selectedDate?.end) {
      selectedDate.value = {
        start: new Date(saved.selectedDate.start),
        end: new Date(saved.selectedDate.end),
      }
    }
    page.value = Number(saved.page || 1)
    pageCount.value = String(saved.pageCount || '5')
    if (saved.sort?.column && saved.sort?.direction) sort.value = saved.sort
    if (Array.isArray(saved.selectedColumnKeys) && saved.selectedColumnKeys.length > 0) {
      selectedColumns.value = columns.value.filter((c: any) => saved.selectedColumnKeys.includes(c.key))
    }
  }
  isMobile.value = window.innerWidth < 640
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 640 })
  fetchAll()
})

watch(() => billStore.lastUpdate, fetchAll, { immediate: true })

const fetchFilteredSalesForExport = async () => {
  const allRows: any[] = []
  let exportPage = 1
  let hasMore = true
  let totalRows = 0
  while (hasMore) {
    const res = await $fetch('/api/billSale/findManyBills', {
      method: 'POST',
      body: {
        companyId: useAuth().session.value?.companyId,
        search: search.value?.trim(),
        selectedStatus: selectedStatus.value,
        minGrandTotal: minGrandTotal.value,
        maxGrandTotal: maxGrandTotal.value,
        startDate: startOfDay(selectedDate.value?.start).toISOString(),
        endDate: endOfDay(selectedDate.value?.end).toISOString(),
        page: exportPage,
        pageCount: 500,
        sortColumn: sort.value.column,
        sortDirection: sort.value.direction,
        isMarkitOnly: true,
      },
    })
    totalRows = Number(res?.total || 0)
    allRows.push(...(res?.rows || []))
    hasMore = allRows.length < totalRows && (res?.rows || []).length > 0
    exportPage++
  }
  return allRows
}

const handleDownloadExcel = async () => {
  try {
    const rows = await fetchFilteredSalesForExport()
    if (!rows.length) {
      toast.add({ title: 'No data to export', color: 'orange' })
      return
    }
    const [{ Workbook }, { saveAs }] = await Promise.all([import('exceljs'), import('file-saver')])
    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet('Online Sales')
    worksheet.columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 14 },
      { header: 'Date', key: 'createdAt', width: 22 },
      { header: 'Customer Name', key: 'customerName', width: 24 },
      { header: 'Customer Phone', key: 'customerPhone', width: 18 },
      { header: 'Sub Total', key: 'subtotal', width: 14 },
      { header: 'Grand Total', key: 'grandTotal', width: 14 },
      { header: 'Notes', key: 'notes', width: 30 },
    ]
    rows.forEach((row: any) => {
      worksheet.addRow({
        invoiceNumber: row.invoiceNumber ?? '',
        createdAt: row.createdAt ? new Date(row.createdAt).toLocaleString() : '',
        customerName: row.client?.name ?? '',
        customerPhone: row.client?.phone ?? '',
        subtotal: Number(row.subtotal || 0),
        grandTotal: Number(row.grandTotal || 0),
        notes: row.notes ?? '',
      })
    })
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    })
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `online-sales-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    )
  } catch (error: any) {
    toast.add({ title: 'Failed to export', description: error?.message || 'Something went wrong', color: 'red' })
  }
}

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1)
const pageTo = computed(() => Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0))

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}
function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const handleUpdate = async (id: string) => {
  try {
    await $fetch('/api/billSale/updateBillNotes', {
      method: 'POST',
      body: { billId: id, companyId: useAuth().session.value?.companyId, notes: notes.value[id] },
    })
    await fetchSales()
    toast.add({ title: 'Notes updated successfully', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Failed to update notes', description: error?.message || 'Something went wrong', color: 'red' })
  }
}

const handleChange = (value: string, row: any) => { notes.value[row.id] = value }

const openBill = async (id) => {
  const sale = sales.value.find(s => s.id === id)
  if (!sale) return
  const session = useAuth().session.value
  const buildData = (sale, session) => ({
    invoiceNumber: sale.invoiceNumber,
    phone: session?.companyPhone,
    description: session?.description,
    thankYouNote: session?.thankYouNote,
    refundPolicy: session?.refundPolicy,
    returnPolicy: session?.returnPolicy,
    date: new Date(sale.createdAt).toISOString(),
    entries: sale.entries.map(entry => {
      const discountVal = Number(entry.discount) < 0 ? Number(entry.discount)
        : Number(entry.discount) > 0 ? `${Number(entry.discount)}%` : 0
      return {
        description: entry.barcode ? entry.name : entry.category,
        hsn: entry.hsn || '',
        qty: Number(entry.qty || 1),
        mrp: Number(entry.rate || 0),
        discount: discountVal,
        tax: Number(entry.tax || 0),
        value: Number(entry.qty || 1) * Number(entry.rate || 0),
        size: entry.size || '',
        barcode: entry.barcode,
        tvalue: Number(entry.value || 0),
      }
    }),
    subtotal: Number(sale.subtotal || 0),
    discount: Number(sale.discount || 0),
    grandTotal: Number(sale.grandTotal || 0),
    paymentMethod: sale.paymentMethod,
    companyName: session?.companyName || '',
    companyAddress: session?.address || {},
    gstin: session?.gstin || '',
    ...(sale.paymentMethod === 'Split' && { splitPayments: sale.splitPayments || [] }),
    accHolderName: session?.accHolderName || '',
    upiId: session?.upiId || '',
    clientName: sale.client?.name || '',
    clientPhone: sale.client?.phone || '',
    tqty: sale.entries.reduce((sum, e) => sum + Number(e.qty || 1), 0),
    tvalue: sale.entries.reduce((sum, e) => sum + Number(e.qty || 1) * Number(e.rate || 0), 0),
    ttvalue: sale.entries.reduce((sum, e) => sum + Number(e.value || 0), 0),
    tdiscount: sale.entries.reduce((sum, e) => {
      const qty = Number(e.qty || 1), rate = Number(e.rate || 0), d = Number(e.discount || 0)
      return d < 0 ? sum + Math.abs(d) * qty : sum + ((rate * d) / 100) * qty
    }, 0),
  })
  printData.value = buildData(sale, session)
  isPrintOpen.value = true
}

</script>


<template>
  <UDashboardPanelContent class="pb-24">

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div
        v-for="card in kpiCards"
        :key="card.label"
        class="text-left rounded-lg border px-4 py-3 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      >
        <div class="flex items-center gap-2 mb-1">
          <UIcon :name="card.icon" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ card.label }}</span>
        </div>
        <div class="text-base font-semibold text-gray-900 dark:text-white truncate">{{ card.value }}</div>
      </div>
    </div>

    <UCard
      class="w-full"
      :ui="{
        base: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
        footer: { padding: 'p-4' },
      }"
    >
      <!-- Date + Search -->
      <template #header>
        <div class="flex items-center gap-3">
          <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
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
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            type="text"
            placeholder="Search Invoice"
            class="w-full sm:w-52"
          />
        </div>
      </template>

      <!-- Toolbar -->
      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm leading-5 sm:block hidden">Rows per page:</span>
          <USelect
            v-model="pageCount"
            :options="[3, 5, 10, 20, 30, 40].map(num => ({ label: num, value: num }))"
            class="me-2 w-20"
            size="xs"
          />
        </div>
        <div class="flex gap-1.5 items-center z-10">
          <USelectMenu v-model="selectedColumns" :options="columns" multiple>
            <UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton>
          </USelectMenu>
          <UButton icon="i-heroicons-arrow-down-tray" color="gray" size="xs" @click="handleDownloadExcel">Download</UButton>
          <UButton icon="i-heroicons-funnel" color="gray" size="xs" @click="openFilterModal">Filters</UButton>
          <UButton icon="i-heroicons-arrow-path" color="gray" size="xs" @click="resetFilters">Reset</UButton>
        </div>
      </div>

      <!-- Table -->
      <UTable
        v-model="selectedRows"
        v-model:sort="sort"
        v-model:expand="expand"
        :rows="styledSales"
        :columns="columnsTable"
        :loading="isLoading"
        :multiple-expand="false"
        sort-mode="manual"
        class="w-full"
      >
        <template #actions-data="{ row }">
          <UDropdown :items="action(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
          </UDropdown>
        </template>

        <template #customer-data="{ row }">
          <div class="flex flex-col">
            {{ row.client?.phone || '-' }}<br/>
            <div class="text-xs text-gray-500">{{ row.client?.name }}</div>
          </div>
        </template>

        <template #grandTotal-data="{ row }">
          {{ row.grandTotal }}
        </template>

        <template #createdAt-data="{ row }">
          {{ new Date(row.createdAt).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }) }}
        </template>

        <template #notes-data="{ row }">
          <UPopover>
            <UButton color="white" :label="row.notes ? 'Open' : 'Add'" trailing-icon="i-heroicons-chevron-down-20-solid" />
            <template #panel>
              <div class="p-4">
                <UTextarea
                  :model-value="row.notes"
                  color="white"
                  variant="outline"
                  placeholder="Notes..."
                  :autoresize="true"
                  @update:modelValue="handleChange($event, row)"
                />
                <UButton
                  trailingIcon="i-heroicons-cloud-arrow-up"
                  size="sm" color="green" variant="solid"
                  label="Update" :trailing="false" class="mt-3"
                  @click="handleUpdate(row.id)"
                />
              </div>
            </template>
          </UPopover>
        </template>

        <template #expand="{ row }">
          <UTable :rows="row.entries" :columns="entrycolumns" />
        </template>
      </UTable>

      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm leading-5 sm:block hidden">
            Showing <span class="font-medium">{{ pageFrom }}</span>
            to <span class="font-medium">{{ pageTo }}</span>
            of <span class="font-medium">{{ pageTotal }}</span> results
          </span>
          <UPagination
            v-model="page"
            :page-count="parseInt(pageCount)"
            :total="pageTotal"
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
              default: { activeButton: { variant: 'outline' } },
            }"
          />
        </div>
      </template>
    </UCard>

    <!-- Filter Modal -->
    <UModal v-model="isFilterModalOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Online Sales Filters</div>
        </template>
        <div class="space-y-3">
          <USelectMenu v-model="draftSelectedStatus" :options="todoStatus" multiple placeholder="Status" />
          <div class="grid grid-cols-2 gap-3">
            <UInput v-model.number="draftMinGrandTotal" type="number" placeholder="Min Total" />
            <UInput v-model.number="draftMaxGrandTotal" type="number" placeholder="Max Total" />
          </div>
        </div>
        <template #footer>
          <div class="w-full flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isFilterModalOpen = false">Cancel</UButton>
            <UButton color="primary" @click="applyFilters">Apply Filter</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Receipt Modal -->
    <UModal v-model="isPrintOpen">
      <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
        <template #header></template>
        <ThermalReceipt :data="printData" />
        <template #footer>
          <div class="flex gap-2 w-full">
            <UButton @click="printBill(printData)">Print</UButton>
            <UButton color="red" @click="isPrintOpen = false">Close</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

  </UDashboardPanelContent>
</template>
