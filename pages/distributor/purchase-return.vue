<script setup lang="ts">
import { useFindManyPurchaseReturn, useDeletePurchaseReturn } from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

const toast     = useToast()
const router    = useRouter()
const useAuth   = () => useNuxtApp().$auth
const companyId = computed(() => useAuth().session.value?.companyId)

const TABLE_STATE_KEY = 'pr_list_table_state_v1'
const isMobile = ref(false)

// ─── Date range ──────────────────────────────────────────────────────────────
const ranges = [
  { label: 'Last 7 days',   duration: { days: 7 } },
  { label: 'Last 14 days',  duration: { days: 14 } },
  { label: 'Last 30 days',  duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year',     duration: { years: 1 } },
]

const selectedDate = ref({ start: new Date(), end: new Date() })

const isRangeSelected = (d: Duration) =>
  isSameDay(selectedDate.value.start, sub(new Date(), d)) &&
  isSameDay(selectedDate.value.end, new Date())

const selectRange = (d: Duration) => {
  selectedDate.value = { start: sub(new Date(), d), end: new Date() }
}

// ─── Filters ─────────────────────────────────────────────────────────────────
const search        = ref('')
const page          = ref(1)
const pageCount     = ref('10')
const sort          = ref({ column: 'returnNo', direction: 'desc' as const })

// Filter modal
const isFilterOpen          = ref(false)
const minTotal              = ref<number | null>(null)
const maxTotal              = ref<number | null>(null)
const draftMinTotal         = ref<number | null>(null)
const draftMaxTotal         = ref<number | null>(null)

const openFilterModal = () => {
  draftMinTotal.value = minTotal.value
  draftMaxTotal.value = maxTotal.value
  isFilterOpen.value = true
}

const applyFilters = () => {
  minTotal.value = draftMinTotal.value
  maxTotal.value = draftMaxTotal.value
  page.value = 1
  isFilterOpen.value = false
}

const resetFilters = () => {
  search.value = ''
  minTotal.value = null
  maxTotal.value = null
  page.value = 1
  selectedDate.value = { start: new Date(), end: new Date() }
}

watch([search, selectedDate, minTotal, maxTotal, pageCount], () => { page.value = 1 }, { deep: true })

// ─── Columns ─────────────────────────────────────────────────────────────────
const desktopColumns = [
  { key: 'returnNo',    label: 'Return #',   sortable: true },
  { key: 'createdAt',   label: 'Date',       sortable: true },
  { key: 'distributor', label: 'Distributor',sortable: false },
  { key: 'poNo',        label: 'PO No',      sortable: false },
  { key: 'items',       label: 'Items',      sortable: false },
  { key: 'subTotalAmount', label: 'Subtotal', sortable: true },
  { key: 'taxAmount',   label: 'Tax',        sortable: true },
  { key: 'totalAmount', label: 'Total',      sortable: true },
  { key: 'actions',     label: '',           sortable: false },
]

const mobileColumns = [
  { key: 'returnNo',    label: 'Return #',   sortable: true },
  { key: 'distributor', label: 'Distributor',sortable: false },
  { key: 'totalAmount', label: 'Total',      sortable: true },
  { key: 'actions',     label: '',           sortable: false },
]

const allColumns = computed(() => isMobile.value ? mobileColumns : desktopColumns)

const selectedColumns = ref([...desktopColumns])
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))
const columnsTable = computed(() => allColumns.value.filter(c => selectedColumns.value.some((s: any) => s.key === c.key)))

watch(allColumns, (cols) => { selectedColumns.value = [...cols] })

// ─── Query ────────────────────────────────────────────────────────────────────
const queryArgs = computed<Prisma.PurchaseReturnFindManyArgs>(() => ({
  where: {
    companyId: companyId.value,
    createdAt: {
      gte: startOfDay(selectedDate.value.start),
      lte: endOfDay(selectedDate.value.end),
    },
  },
  select: {
    id: true,
    returnNo: true,
    createdAt: true,
    totalAmount: true,
    subTotalAmount: true,
    taxAmount: true,
    remarks: true,
    distributorCompany: {
      select: { distributor: { select: { name: true } } },
    },
    purchaseOrder: { select: { purchaseOrderNo: true } },
    items: {
      select: {
        id: true, productName: true, barcode: true, size: true,
        qty: true, rate: true, tax: true, taxAmount: true, subtotal: true, reason: true,
      },
    },
  },
  orderBy: { createdAt: 'desc' },
}))

const { data, isLoading } = useFindManyPurchaseReturn(queryArgs)

// ─── Filter + paginate client-side ───────────────────────────────────────────
const filtered = computed(() => {
  let rows = (data.value ?? []) as any[]
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    rows = rows.filter(r =>
      String(r.returnNo ?? '').includes(q) ||
      (r.distributorCompany as any)?.distributor?.name?.toLowerCase().includes(q)
    )
  }
  if (minTotal.value !== null) rows = rows.filter(r => Number(r.totalAmount) >= minTotal.value!)
  if (maxTotal.value !== null) rows = rows.filter(r => Number(r.totalAmount) <= maxTotal.value!)
  return rows
})

const pageFrom = computed(() => filtered.value.length ? (page.value - 1) * Number(pageCount.value) + 1 : 0)
const pageTo   = computed(() => Math.min(page.value * Number(pageCount.value), filtered.value.length))

const paginated = computed(() =>
  filtered.value.slice((page.value - 1) * Number(pageCount.value), page.value * Number(pageCount.value))
)

// ─── Expand ───────────────────────────────────────────────────────────────────
const expand = ref({ openedRows: [] as any[], row: null as any })

const entryColumns = [
  { key: 'productName', label: 'Product' },
  { key: 'barcode',     label: 'Barcode' },
  { key: 'size',        label: 'Size' },
  { key: 'qty',         label: 'Qty' },
  { key: 'rate',        label: 'Rate' },
  { key: 'tax',         label: 'Tax%' },
  { key: 'taxAmount',   label: 'Tax Amt' },
  { key: 'subtotal',    label: 'Subtotal' },
  { key: 'reason',      label: 'Reason' },
]

// ─── Delete ───────────────────────────────────────────────────────────────────
const DeleteReturn  = useDeletePurchaseReturn({ optimisticUpdate: true })
const isDeleteOpen  = ref(false)
const deletingRow   = ref<any>(null)
const isDeleting    = ref(false)

const confirmDelete = (row: any) => { deletingRow.value = row; isDeleteOpen.value = true }

const handleDelete = async () => {
  isDeleting.value = true
  try {
    await DeleteReturn.mutateAsync({ where: { id: deletingRow.value.id } })
    toast.add({ title: 'Deleted', color: 'green' })
    isDeleteOpen.value = false
  } catch (err: any) {
    toast.add({ title: 'Error', color: 'red', description: err.message })
  } finally {
    isDeleting.value = false
  }
}

// ─── Download PDF ─────────────────────────────────────────────────────────────
const isDownloading = ref(false)

const downloadPdf = async (id: string, returnNo: number | null) => {
  isDownloading.value = true
  try {
    const res = await $fetch.raw('/api/downloads/purchase-return.pdf', {
      method: 'GET',
      params: { purchaseReturnId: id },
    })
    const url = URL.createObjectURL(new Blob([res._data as ArrayBuffer], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `return-${returnNo ?? id.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    toast.add({ title: 'Download failed', color: 'red', description: err.message })
  } finally {
    isDownloading.value = false
  }
}

// ─── Excel export ─────────────────────────────────────────────────────────────
const handleDownloadExcel = async () => {
  const rows = filtered.value
  if (!rows.length) {
    toast.add({ title: 'No data to export', color: 'orange' })
    return
  }
  try {
    const [{ Workbook }, { saveAs }] = await Promise.all([
      import('exceljs'),
      import('file-saver'),
    ])
    const workbook  = new Workbook()
    const worksheet = workbook.addWorksheet('Purchase Returns')

    worksheet.columns = [
      { header: 'Return #',    key: 'returnNo',    width: 12 },
      { header: 'Date',        key: 'createdAt',   width: 20 },
      { header: 'Distributor', key: 'distributor', width: 24 },
      { header: 'PO No',       key: 'poNo',        width: 12 },
      { header: 'Items',       key: 'items',       width: 8  },
      { header: 'Subtotal',    key: 'subTotal',    width: 12 },
      { header: 'Tax',         key: 'tax',         width: 10 },
      { header: 'Total',       key: 'total',       width: 12 },
      { header: 'Remarks',     key: 'remarks',     width: 30 },
    ]

    rows.forEach((r: any) => {
      worksheet.addRow({
        returnNo:    r.returnNo ?? '',
        createdAt:   r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
        distributor: (r.distributorCompany as any)?.distributor?.name ?? '',
        poNo:        r.purchaseOrder?.purchaseOrderNo ?? '',
        items:       (r.items as any[]).length,
        subTotal:    Number(r.subTotalAmount || 0),
        tax:         Number(r.taxAmount || 0),
        total:       Number(r.totalAmount || 0),
        remarks:     r.remarks ?? '',
      })
    })

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    })

    const buffer   = await workbook.xlsx.writeBuffer()
    const filename = `purchase-returns-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
  } catch (err: any) {
    toast.add({ title: 'Failed to export', description: err.message, color: 'red' })
  }
}

// ─── Row actions ──────────────────────────────────────────────────────────────
const rowAction = (row: any) => [
  [
    { label: 'Edit',         icon: 'i-heroicons-pencil-square-20-solid', click: () => router.push(`/distributor/edit-purchase-return/${row.id}`) },
    { label: 'Download PDF', icon: 'i-heroicons-document-text',          click: () => downloadPdf(row.id, row.returnNo) },
  ],
  [{ label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => confirmDelete(row) }],
]

// ─── localStorage state ───────────────────────────────────────────────────────
watch(
  [search, minTotal, maxTotal, page, pageCount, sort, selectedColumnKeys,
   () => selectedDate.value.start, () => selectedDate.value.end],
  () => {
    if (!process.client) return
    localStorage.setItem(TABLE_STATE_KEY, JSON.stringify({
      search:     search.value,
      minTotal:   minTotal.value,
      maxTotal:   maxTotal.value,
      page:       page.value,
      pageCount:  pageCount.value,
      sort:       sort.value,
      selectedDate: { start: selectedDate.value.start.toISOString(), end: selectedDate.value.end.toISOString() },
      selectedColumnKeys: selectedColumnKeys.value,
    }))
  },
  { deep: true }
)

onMounted(() => {
  isMobile.value = window.innerWidth < 640
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 640 })

  if (process.client) {
    const raw = localStorage.getItem(TABLE_STATE_KEY)
    if (raw) {
      try {
        const s = JSON.parse(raw)
        search.value    = s.search    ?? ''
        minTotal.value  = s.minTotal  ?? null
        maxTotal.value  = s.maxTotal  ?? null
        page.value      = Number(s.page || 1)
        pageCount.value = String(s.pageCount || '10')
        if (s.sort?.column) sort.value = s.sort
        if (s.selectedDate?.start && s.selectedDate?.end) {
          selectedDate.value = { start: new Date(s.selectedDate.start), end: new Date(s.selectedDate.end) }
        }
        if (Array.isArray(s.selectedColumnKeys)) {
          selectedColumns.value = desktopColumns.filter(c => s.selectedColumnKeys.includes(c.key))
        }
      } catch { /* ignore */ }
    }
  }
})
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UCard
      class="w-full"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
        footer: { padding: 'p-4' },
      }"
    >
      <!-- ── Header: date + search + new button ── -->
      <template #header>
        <div class="flex justify-between items-center gap-3 w-full flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <!-- Date range picker -->
            <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
              <UButton icon="i-heroicons-calendar-days-20-solid" color="gray" variant="outline" size="sm">
                {{ format(selectedDate.start, 'd MMM, yyyy') }} – {{ format(selectedDate.end, 'd MMM, yyyy') }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton
                      v-for="(r, i) in ranges" :key="i"
                      :label="r.label" color="gray" variant="ghost"
                      class="rounded-none px-6"
                      :class="isRangeSelected(r.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                      truncate @click="selectRange(r.duration)"
                    />
                  </div>
                  <DatePicker v-model="selectedDate" @close="close" />
                </div>
              </template>
            </UPopover>

            <!-- Search -->
            <UInput
              v-model="search"
              icon="i-heroicons-magnifying-glass-20-solid"
              placeholder="Search return # or distributor..."
              size="sm"
              class="w-56"
            />
          </div>

          <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            label="New Return"
            @click="router.push('/distributor/add-purchase-return')"
          />
        </div>
      </template>

      <!-- ── Toolbar: rows per page + column visibility + download + filter + reset ── -->
      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
          <USelect
            v-model="pageCount"
            :options="[5, 10, 20, 30, 50].map(n => ({ label: n, value: String(n) }))"
            size="xs"
            class="w-20"
          />
        </div>

        <div class="flex gap-1.5 items-center z-10">
          <USelectMenu v-model="selectedColumns" :options="allColumns" multiple>
            <UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton>
          </USelectMenu>

          <UButton icon="i-heroicons-arrow-down-tray" color="gray" size="xs" @click="handleDownloadExcel">
            Download
          </UButton>

          <UButton icon="i-heroicons-funnel" color="gray" size="xs" @click="openFilterModal">
            Filters
          </UButton>

          <UButton icon="i-heroicons-arrow-path" color="gray" size="xs" @click="resetFilters">
            Reset
          </UButton>
        </div>
      </div>

      <!-- ── Table ── -->
      <UTable
        v-model:sort="sort"
        v-model:expand="expand"
        :rows="paginated"
        :columns="columnsTable"
        :loading="isLoading"
        :multiple-expand="false"
        class="w-full"
      >
        <template #returnNo-data="{ row }">
          <span class="font-mono font-semibold text-orange-600">#{{ row.returnNo ?? '-' }}</span>
        </template>

        <template #createdAt-data="{ row }">
          {{ new Date(row.createdAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
        </template>

        <template #distributor-data="{ row }">
          {{ (row.distributorCompany as any)?.distributor?.name ?? '-' }}
        </template>

        <template #poNo-data="{ row }">
          <span v-if="row.purchaseOrder?.purchaseOrderNo" class="font-mono text-xs">#{{ row.purchaseOrder.purchaseOrderNo }}</span>
          <span v-else class="text-xs text-gray-400">-</span>
        </template>

        <template #items-data="{ row }">
          <UBadge color="gray" variant="subtle" size="xs">{{ (row.items as any[]).length }}</UBadge>
        </template>

        <template #subTotalAmount-data="{ row }">
          ₹{{ Number(row.subTotalAmount || 0).toFixed(2) }}
        </template>

        <template #taxAmount-data="{ row }">
          ₹{{ Number(row.taxAmount || 0).toFixed(2) }}
        </template>

        <template #totalAmount-data="{ row }">
          <span class="font-semibold text-orange-600">₹{{ Number(row.totalAmount || 0).toFixed(2) }}</span>
        </template>

        <template #actions-data="{ row }">
          <UDropdown :items="rowAction(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" size="xs" />
          </UDropdown>
        </template>

        <!-- Expanded row: items table -->
        <template #expand="{ row }">
          <div class="px-4 py-3">
            <UTable
              :rows="(row.items as any[])"
              :columns="entryColumns"
              :ui="{ thead: 'bg-gray-50 dark:bg-gray-800', tr: { base: 'text-xs' } }"
            >
              <template #rate-data="{ row: item }">₹{{ Number(item.rate || 0).toFixed(2) }}</template>
              <template #taxAmount-data="{ row: item }">₹{{ Number(item.taxAmount || 0).toFixed(2) }}</template>
              <template #subtotal-data="{ row: item }">
                <span class="font-medium">₹{{ Number(item.subtotal || 0).toFixed(2) }}</span>
              </template>
              <template #size-data="{ row: item }">{{ item.size || '-' }}</template>
              <template #barcode-data="{ row: item }">
                <span class="font-mono text-xs">{{ item.barcode || '-' }}</span>
              </template>
              <template #reason-data="{ row: item }">
                <span class="text-gray-500">{{ item.reason || '-' }}</span>
              </template>
            </UTable>
          </div>
        </template>
      </UTable>

      <!-- ── Footer: pagination ── -->
      <template #footer>
        <div class="flex flex-wrap justify-between items-center gap-2">
          <span class="text-sm hidden sm:block">
            Showing <span class="font-medium">{{ pageFrom }}</span> to
            <span class="font-medium">{{ pageTo }}</span> of
            <span class="font-medium">{{ filtered.length }}</span> results
          </span>
          <UPagination
            v-model="page"
            :page-count="Number(pageCount)"
            :total="filtered.length"
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
              default: { activeButton: { variant: 'outline' } },
            }"
          />
        </div>
      </template>
    </UCard>

    <!-- Delete confirm modal -->
    <UDashboardModal
      v-model="isDeleteOpen"
      title="Delete Return"
      :description="`Are you sure you want to delete Return #${deletingRow?.returnNo}?`"
      icon="i-heroicons-exclamation-circle"
      prevent-close
      :close-button="null"
      :ui="{ icon: { base: 'text-red-500' } as any, footer: { base: 'ml-16' } as any }"
    >
      <template #footer>
        <UButton color="red" label="Delete" :loading="isDeleting" @click="handleDelete" />
        <UButton color="white" label="Cancel" @click="isDeleteOpen = false" />
      </template>
    </UDashboardModal>

    <!-- Filter modal -->
    <UModal v-model="isFilterOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Purchase Return Filters</div>
        </template>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UInput v-model.number="draftMinTotal" type="number" placeholder="Min Total" />
            <UInput v-model.number="draftMaxTotal" type="number" placeholder="Max Total" />
          </div>
        </div>
        <template #footer>
          <div class="w-full flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isFilterOpen = false">Cancel</UButton>
            <UButton color="primary" @click="applyFilters">Apply</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
