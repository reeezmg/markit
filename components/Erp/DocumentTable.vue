<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { format, subDays, subMonths, subYears } from 'date-fns'
import { documentListDefaults, documentExportRows, type DocumentListState } from '~/utils/erp-document-table'
import { billingErrorMessage } from '~/utils/billing-error'

type Column = { key: string; label: string; sortable?: boolean }
const props = defineProps<{
  modelValue: DocumentListState
  title: string
  storageKey: string
  columns: Column[]
  rows: any[]
  total: number
  loading?: boolean
  cards?: { label: string; value: string; icon: string; filter?: string }[]
  filterOptions: { label: string; value: string }[]
  filterKey: 'state' | 'status'
  loadRows: (query: DocumentListState) => Promise<{ rows: any[]; total: number }>
  exportValue: (row: any, key: string) => string | number
}>()
const emit = defineEmits<{
  'update:modelValue': [value: DocumentListState]
  refresh: []
}>()
const toast = useToast()
function update(patch: Partial<DocumentListState>, resetPage = true) {
  emit('update:modelValue', { ...props.modelValue, ...(resetPage ? { page: 1 } : {}), ...patch })
}
const search = ref(props.modelValue.q)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, q => {
  clearTimeout(timer)
  if (q !== props.modelValue.q) timer = setTimeout(() => update({ q }), 250)
})
watch(() => props.modelValue.q, q => { if (search.value !== q) search.value = q })
onBeforeUnmount(() => clearTimeout(timer))
const selectedRows = ref<any[]>([])
watch(() => props.rows, () => { selectedRows.value = [] })
watch(() => props.modelValue, () => { selectedRows.value = [] })
watch(() => props.total, total => {
  const last = Math.max(1, Math.ceil(total / props.modelValue.pageSize))
  if (props.modelValue.page > last) update({ page: last }, false)
})
const availableColumns = computed(() => props.columns.filter(column => column.key !== 'actions'))
const selectedColumns = ref<Column[]>([...availableColumns.value])
const columns = computed(() => props.columns.filter(column => column.key === 'actions' || selectedColumns.value.some(selected => selected.key === column.key)))
let restored = false
function restoreColumns() {
  selectedColumns.value = [...availableColumns.value]
  try {
    const saved = JSON.parse(localStorage.getItem(props.storageKey) || 'null')
    if (Array.isArray(saved)) {
      const found = availableColumns.value.filter(column => saved.includes(column.key))
      if (found.length) selectedColumns.value = found
    }
  } catch { /* Browser storage is optional. */ }
}
onMounted(() => { restoreColumns(); restored = true })
watch(() => props.storageKey, () => { if (restored) restoreColumns() })
watch(selectedColumns, value => {
  if (restored) try { localStorage.setItem(props.storageKey, JSON.stringify(value.map(column => column.key))) } catch { /* Storage can be disabled. */ }
})
const sort = computed({
  get: () => ({ column: props.modelValue.sort, direction: props.modelValue.order }),
  set: value => { if (value?.column) update({ sort: value.column, order: value.direction }) },
})
const dateRange = computed({
  get: () => ({ start: props.modelValue.from ? new Date(props.modelValue.from + 'T00:00:00') : new Date(), end: props.modelValue.to ? new Date(props.modelValue.to + 'T00:00:00') : new Date() }),
  set: value => { if (value?.start && value?.end) update({ from: format(value.start, 'yyyy-MM-dd'), to: format(value.end, 'yyyy-MM-dd') }) },
})
const dateLabel = computed(() => props.modelValue.from || props.modelValue.to
  ? `${props.modelValue.from || 'Start'} — ${props.modelValue.to || 'Today'}` : 'All dates')
const ranges = [
  { label: 'Last 7 days', start: () => subDays(new Date(), 7) },
  { label: 'Last 14 days', start: () => subDays(new Date(), 14) },
  { label: 'Last 30 days', start: () => subDays(new Date(), 30) },
  { label: 'Last 3 months', start: () => subMonths(new Date(), 3) },
  { label: 'Last year', start: () => subYears(new Date(), 1) },
]
function selectRange(start: Date) { update({ from: format(start, 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) }
const filtersOpen = ref(false)
const draft = ref({ status: '', min: '', max: '' })
const filterError = ref('')
const activeFilters = computed(() => !!(props.modelValue[props.filterKey] || props.modelValue.min || props.modelValue.max))
function openFilters() {
  draft.value = { status: props.modelValue[props.filterKey], min: props.modelValue.min, max: props.modelValue.max }
  filterError.value = ''; filtersOpen.value = true
}
function applyFilters() {
  const { min, max } = draft.value
  if ([min, max].some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) || (min !== '' && max !== '' && Number(min) > Number(max))) {
    filterError.value = 'Enter a valid minimum and maximum amount.'; return
  }
  update({ [props.filterKey]: draft.value.status, min, max }); filtersOpen.value = false
}
function reset() {
  clearTimeout(timer); search.value = ''
  emit('update:modelValue', documentListDefaults(props.columns.find(column => column.key === 'paymentDate' || column.key === 'invoiceDate' || column.key === 'quoteDate')!.key))
  selectedRows.value = []
}
const exporting = ref(false)
async function download(kind: 'pdf' | 'excel') {
  if (exporting.value) return
  exporting.value = true
  const filters = { ...props.modelValue }
  const exportColumns = columns.value.filter(column => column.key !== 'actions')
  const selection = [...selectedRows.value]
  try {
    const rows = selection.length ? selection : await documentExportRows(props.loadRows, filters)
    const { exportDocumentTable } = await import('~/utils/erp-document-export.client')
    await exportDocumentTable(kind, props.title, exportColumns, rows, props.exportValue)
  } catch (error) { toast.add({ title: 'Could not export records', description: billingErrorMessage(error), color: 'red' }) }
  finally { exporting.value = false }
}
const downloadItems = computed(() => [[
  { label: selectedRows.value.length ? `PDF (${selectedRows.value.length} selected)` : 'PDF', icon: 'i-heroicons-document', click: () => download('pdf') },
  { label: selectedRows.value.length ? `Excel (${selectedRows.value.length} selected)` : 'Excel', icon: 'i-heroicons-table-cells', click: () => download('excel') },
]])
</script>

<template>
  <div>
    <div v-if="cards?.length" class="grid grid-cols-2 gap-3 mb-4" :class="cards.length === 5 ? 'sm:grid-cols-5' : cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'">
      <button v-for="card in cards" :key="card.label" type="button"
        class="text-left rounded-lg border px-4 py-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        :class="card.filter !== undefined && modelValue[filterKey] === card.filter ? 'border-primary-400 bg-primary-50 dark:bg-primary-950 ring-1 ring-primary-400' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'"
        :disabled="card.filter === undefined" @click="card.filter !== undefined && update({ [filterKey]: card.filter })">
        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400"><UIcon :name="card.icon" class="h-4 w-4" /><span class="text-xs uppercase tracking-wide">{{ card.label }}</span></div>
        <div class="mt-1 text-lg font-semibold tabular-nums">{{ loading ? '…' : card.value }}</div>
      </button>
    </div>
    <UCard class="w-full" :ui="{ base: '', divide: 'divide-y divide-gray-200 dark:divide-gray-700', header: { padding: 'px-4 py-5' }, body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' }, footer: { padding: 'p-4' } }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <slot name="company" />
            <UPopover :popper="{ placement: 'bottom-start' }">
              <UButton icon="i-heroicons-calendar-days-20-solid" class="w-full sm:w-60">{{ dateLabel }}</UButton>
              <template #panel="{ close }"><div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                <div class="hidden sm:flex flex-col py-4">
                  <UButton v-for="range in ranges" :key="range.label" color="gray" variant="ghost" class="rounded-none px-6" @click="selectRange(range.start()); close()">{{ range.label }}</UButton>
                  <UButton color="gray" variant="ghost" class="rounded-none px-6" @click="update({ from: '', to: '' }); close()">All dates</UButton>
                </div>
                <DatePicker v-model="dateRange" @close="close" />
              </div></template>
            </UPopover>
            <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid" :placeholder="`Search ${title.toLowerCase()}`" :aria-label="`Search ${title.toLowerCase()}`" class="w-full sm:w-52" />
          </div>
          <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="loading" aria-label="Refresh table" @click="emit('refresh')" />
        </div>
      </template>
      <div class="flex flex-wrap justify-between items-center gap-3 px-4 py-3">
        <div class="flex items-center gap-1.5"><span class="hidden sm:block text-sm">Rows per page:</span>
          <USelect :model-value="modelValue.pageSize" :options="[3, 5, 10, 20, 30, 40]" class="w-20" size="xs" aria-label="Rows per page" @update:model-value="update({ pageSize: Number($event) })" />
          <span v-if="selectedRows.length" class="text-xs text-gray-500">{{ selectedRows.length }} selected</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <USelectMenu v-model="selectedColumns" :options="availableColumns" multiple><UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton></USelectMenu>
          <UDropdown :items="downloadItems"><UButton icon="i-heroicons-arrow-down-tray" color="gray" size="xs" trailing :loading="exporting" :disabled="exporting">Download</UButton></UDropdown>
          <UButton icon="i-heroicons-funnel" :color="activeFilters ? 'primary' : 'gray'" size="xs" @click="openFilters">Filters</UButton>
          <UButton icon="i-heroicons-arrow-path" color="gray" size="xs" @click="reset">Reset</UButton>
        </div>
      </div>
      <UTable v-model="selectedRows" v-model:sort="sort" :rows="rows" :columns="columns" :loading="loading" sort-mode="manual" class="w-full" :empty-state="{ icon: 'i-heroicons-document-text', label: `No ${title.toLowerCase()} found` }">
        <template v-for="name in Object.keys($slots).filter(name => name.endsWith('-data'))" #[name]="slotData"><slot :name="name" v-bind="slotData" /></template>
      </UTable>
      <template #footer>
        <div class="flex flex-wrap justify-between items-center gap-3">
          <span class="text-sm text-gray-500">Showing <span class="font-medium">{{ total ? (modelValue.page - 1) * modelValue.pageSize + 1 : 0 }}</span> to <span class="font-medium">{{ Math.min(modelValue.page * modelValue.pageSize, total) }}</span> of <span class="font-medium">{{ total }}</span> results</span>
          <UPagination :model-value="modelValue.page" :total="total" :page-count="modelValue.pageSize" @update:model-value="update({ page: $event }, false)" />
        </div>
      </template>
    </UCard>
    <UModal v-model="filtersOpen"><UCard><template #header><h3 class="font-semibold">Filter {{ title.toLowerCase() }}</h3></template>
      <form class="space-y-4" @submit.prevent="applyFilters">
        <UFormGroup label="Status"><USelect v-model="draft.status" :options="filterOptions" aria-label="Filter status" /></UFormGroup>
        <div class="grid grid-cols-2 gap-3"><UFormGroup label="Minimum amount"><UInput v-model="draft.min" type="number" min="0" step="0.01" aria-label="Minimum amount" /></UFormGroup><UFormGroup label="Maximum amount"><UInput v-model="draft.max" type="number" min="0" step="0.01" aria-label="Maximum amount" /></UFormGroup></div>
        <p v-if="filterError" class="text-sm text-red-500">{{ filterError }}</p>
        <div class="flex justify-end gap-2"><UButton color="gray" @click="filtersOpen = false">Cancel</UButton><UButton type="submit">Apply filters</UButton></div>
      </form>
    </UCard></UModal>
  </div>
</template>
