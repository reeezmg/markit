Transform the target list page's table to match the standard storetools table pattern used in `pages/erp/sales.vue` and `pages/distributor/purchase-return.vue`.

## Steps

1. **Read the target file first.** Understand the entity, data hook/fetch, existing columns, and row actions.
2. **Apply the full pattern below**, adapting all names, columns, and fields to the actual entity.

---

## Script additions

```ts
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

const TABLE_STATE_KEY = '<entity>_list_table_state_v1'
const isMobile = ref(false)

// ── Date range ────────────────────────────────────────────────────────────────
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

// ── Filters ───────────────────────────────────────────────────────────────────
const search    = ref('')
const page      = ref(1)
const pageCount = ref('10')
const sort      = ref({ column: '<primary_sort_column>', direction: 'desc' as const })

const isFilterOpen  = ref(false)
const minTotal      = ref<number | null>(null)
const maxTotal      = ref<number | null>(null)
const draftMinTotal = ref<number | null>(null)
const draftMaxTotal = ref<number | null>(null)

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

// ── Columns ───────────────────────────────────────────────────────────────────
const desktopColumns = [ /* all columns with sortable: true/false */ ]
const mobileColumns  = [ /* key columns only */ ]

const allColumns = computed(() => isMobile.value ? mobileColumns : desktopColumns)
const selectedColumns = ref([...desktopColumns])
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))
const columnsTable = computed(() =>
  allColumns.value.filter(c => selectedColumns.value.some((s: any) => s.key === c.key))
)
watch(allColumns, cols => { selectedColumns.value = [...cols] })

// ── Existing query — add createdAt date filter to where clause ─────────────────
// gte: startOfDay(selectedDate.value.start), lte: endOfDay(selectedDate.value.end)

// ── Client-side filter + paginate ─────────────────────────────────────────────
const filtered = computed(() => {
  let rows = (data.value ?? []) as any[]
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    rows = rows.filter(r => /* search relevant string fields */)
  }
  if (minTotal.value !== null) rows = rows.filter(r => Number(r.totalAmount) >= minTotal.value!)
  if (maxTotal.value !== null) rows = rows.filter(r => Number(r.totalAmount) <= maxTotal.value!)
  return rows
})

const pageFrom  = computed(() => filtered.value.length ? (page.value - 1) * Number(pageCount.value) + 1 : 0)
const pageTo    = computed(() => Math.min(page.value * Number(pageCount.value), filtered.value.length))
const paginated = computed(() =>
  filtered.value.slice((page.value - 1) * Number(pageCount.value), page.value * Number(pageCount.value))
)

// ── Expand ────────────────────────────────────────────────────────────────────
const expand = ref({ openedRows: [] as any[], row: null as any })
const entryColumns = [ /* child/item row columns */ ]

// ── Excel export ──────────────────────────────────────────────────────────────
const handleDownloadExcel = async () => {
  const rows = filtered.value
  if (!rows.length) { toast.add({ title: 'No data to export', color: 'orange' }); return }
  try {
    const [{ Workbook }, { saveAs }] = await Promise.all([
      import('exceljs'), import('file-saver'),
    ])
    const workbook  = new Workbook()
    const worksheet = workbook.addWorksheet('<EntityName>')
    worksheet.columns = [ /* { header, key, width } per column */ ]
    rows.forEach((r: any) => { worksheet.addRow({ /* mapped fields */ }) })
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    })
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `<entity>-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    )
  } catch (err: any) {
    toast.add({ title: 'Failed to export', description: err.message, color: 'red' })
  }
}

// ── localStorage state ────────────────────────────────────────────────────────
watch(
  [search, minTotal, maxTotal, page, pageCount, sort, selectedColumnKeys,
   () => selectedDate.value.start, () => selectedDate.value.end],
  () => {
    if (!process.client) return
    localStorage.setItem(TABLE_STATE_KEY, JSON.stringify({
      search: search.value, minTotal: minTotal.value, maxTotal: maxTotal.value,
      page: page.value, pageCount: pageCount.value, sort: sort.value,
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
        if (s.selectedDate?.start && s.selectedDate?.end)
          selectedDate.value = { start: new Date(s.selectedDate.start), end: new Date(s.selectedDate.end) }
        if (Array.isArray(s.selectedColumnKeys))
          selectedColumns.value = desktopColumns.filter(c => s.selectedColumnKeys.includes(c.key))
      } catch { /* ignore */ }
    }
  }
})
```

---

## Template structure

```vue
<template>
  <UDashboardPanelContent class="pb-24">
    <UCard class="w-full" :ui="{
      divide: 'divide-y divide-gray-200 dark:divide-gray-700',
      header: { padding: 'px-4 py-5' },
      body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
      footer: { padding: 'p-4' },
    }">

      <!-- HEADER: date picker + search + primary action -->
      <template #header>
        <div class="flex justify-between items-center gap-3 w-full flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
              <UButton icon="i-heroicons-calendar-days-20-solid" color="gray" variant="outline" size="sm">
                {{ format(selectedDate.start, 'd MMM, yyyy') }} – {{ format(selectedDate.end, 'd MMM, yyyy') }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton v-for="(r, i) in ranges" :key="i" :label="r.label" color="gray" variant="ghost"
                      class="rounded-none px-6"
                      :class="isRangeSelected(r.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                      truncate @click="selectRange(r.duration)" />
                  </div>
                  <DatePicker v-model="selectedDate" @close="close" />
                </div>
              </template>
            </UPopover>
            <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid"
              placeholder="Search..." size="sm" class="w-56" />
          </div>
          <UButton icon="i-heroicons-plus" size="sm" color="primary" label="New <Entity>"
            @click="router.push('/<new-route>')" />
        </div>
      </template>

      <!-- TOOLBAR: rows/page + column visibility + download + filter + reset -->
      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm hidden sm:block">Rows per page:</span>
          <USelect v-model="pageCount"
            :options="[5, 10, 20, 30, 50].map(n => ({ label: n, value: String(n) }))"
            size="xs" class="w-20" />
        </div>
        <div class="flex gap-1.5 items-center z-10">
          <USelectMenu v-model="selectedColumns" :options="allColumns" multiple>
            <UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton>
          </USelectMenu>
          <UButton icon="i-heroicons-arrow-down-tray" color="gray" size="xs" @click="handleDownloadExcel">Download</UButton>
          <UButton icon="i-heroicons-funnel"          color="gray" size="xs" @click="openFilterModal">Filters</UButton>
          <UButton icon="i-heroicons-arrow-path"      color="gray" size="xs" @click="resetFilters">Reset</UButton>
        </div>
      </div>

      <!-- TABLE -->
      <UTable v-model:sort="sort" v-model:expand="expand"
        :rows="paginated" :columns="columnsTable" :loading="isLoading"
        :multiple-expand="false" class="w-full">

        <!-- custom cell slots per column -->

        <!-- expandable child rows -->
        <template #expand="{ row }">
          <div class="px-4 py-3">
            <UTable :rows="row.items" :columns="entryColumns"
              :ui="{ thead: 'bg-gray-50 dark:bg-gray-800', tr: { base: 'text-xs' } }" />
          </div>
        </template>

        <template #actions-data="{ row }">
          <UDropdown :items="rowAction(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" size="xs" />
          </UDropdown>
        </template>
      </UTable>

      <!-- FOOTER -->
      <template #footer>
        <div class="flex flex-wrap justify-between items-center gap-2">
          <span class="text-sm hidden sm:block">
            Showing <span class="font-medium">{{ pageFrom }}</span> to
            <span class="font-medium">{{ pageTo }}</span> of
            <span class="font-medium">{{ filtered.length }}</span> results
          </span>
          <UPagination v-model="page" :page-count="Number(pageCount)" :total="filtered.length"
            :ui="{ wrapper: 'flex items-center gap-1', rounded: '!rounded-full min-w-[32px] justify-center',
                   default: { activeButton: { variant: 'outline' } } }" />
        </div>
      </template>
    </UCard>

    <!-- DELETE CONFIRM -->
    <UDashboardModal v-model="isDeleteOpen" title="Delete <Entity>"
      :description="`Are you sure you want to delete ...?`"
      icon="i-heroicons-exclamation-circle" prevent-close :close-button="null"
      :ui="{ icon: { base: 'text-red-500' } as any, footer: { base: 'ml-16' } as any }">
      <template #footer>
        <UButton color="red" label="Delete" :loading="isDeleting" @click="handleDelete" />
        <UButton color="white" label="Cancel" @click="isDeleteOpen = false" />
      </template>
    </UDashboardModal>

    <!-- FILTER MODAL -->
    <UModal v-model="isFilterOpen">
      <UCard>
        <template #header><div class="text-base font-semibold">Filters</div></template>
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
```

---

## Rules

- Always read the target file first before making changes.
- Preserve all existing logic (hooks, delete handler, PDF download, etc.) — only restructure/add.
- Adapt column names, search fields, Excel headers, and filter fields to the actual entity.
- If the entity has child rows (items, entries), add them to the select query and wire the expand slot.
- Use `exceljs` and `file-saver` — already installed in storetools.
- Filter modal fields should be relevant to the entity (amount range for financial records, status for orders, etc.).
