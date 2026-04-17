<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

import AccountTransferForm from '~/components/AccountTransfer/Form.vue'

import {
  useCreateAccountTransfer,
  useUpdateAccountTransfer,
  useDeleteAccountTransfer,
  useFindManyAccountTransfer,
  useFindManyBankAccount,
  useFindUniqueCompany,
} from '~/lib/hooks'

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

const transferTableStore = useTransferTableStore()
const isMobile = ref(false)

/* ---------------------------------------------------
   HOOKS
--------------------------------------------------- */
const createTransfer = useCreateAccountTransfer({ optimisticUpdate: true })
const updateTransfer = useUpdateAccountTransfer({ optimisticUpdate: true })
const deleteTransfer = useDeleteAccountTransfer({ optimisticUpdate: true })

/* ---------------------------------------------------
   MODAL STATE
--------------------------------------------------- */
const showTransferForm = ref(false)
const selectedTransfer = ref<any | null>(null)
const isDeleteModalOpen = ref(false)
const deletingRow = ref<any>(null)

/* ---------------------------------------------------
   OPEN / CLOSE
--------------------------------------------------- */
const openTransferForm = (row = null) => {
  selectedTransfer.value = row
  showTransferForm.value = true
}

const closeTransferForm = () => {
  showTransferForm.value = false
  selectedTransfer.value = null
}

/* ---------------------------------------------------
   SAVE (CREATE / UPDATE)
--------------------------------------------------- */
const saveTransfer = async (transfer: any) => {
  try {
    if (selectedTransfer.value) {
      await updateTransfer.mutateAsync({
        where: { id: selectedTransfer.value.id },
        data: {
          ...(transfer.date && {
            createdAt: new Date(transfer.date).toISOString(),
          }),
          fromType: transfer.fromType,
          toType: transfer.toType,
          amount: transfer.amount,
          note: transfer.note ?? null,
          fromAccountId: transfer.fromAccountId ?? null,
          toAccountId: transfer.toAccountId ?? null,
        },
      })
      toast.add({ title: 'Transfer updated', color: 'green' })
    } else {
      await createTransfer.mutateAsync({
        data: {
          ...(transfer.date && {
            createdAt: new Date(transfer.date).toISOString(),
          }),
          fromType: transfer.fromType,
          toType: transfer.toType,
          amount: transfer.amount,
          note: transfer.note ?? null,
          ...(transfer.fromAccountId && {
            fromAccountId: transfer.fromAccountId,
          }),
          ...(transfer.toAccountId && {
            toAccountId: transfer.toAccountId,
          }),
          company: {
            connect: { id: useAuth().session.value!.companyId },
          },
        },
      })
      toast.add({ title: 'Transfer created', color: 'green' })
    }

    closeTransferForm()
  } catch (err: any) {
    toast.add({
      title: 'Transfer failed',
      description: err.message,
      color: 'red',
    })
  }
}

/* ---------------------------------------------------
   DELETE
--------------------------------------------------- */
const confirmDelete = async () => {
  await deleteTransfer.mutateAsync({
    where: { id: deletingRow.value.id },
  })
  toast.add({ title: 'Transfer deleted', color: 'green' })
  isDeleteModalOpen.value = false
}

/* ---------------------------------------------------
   DATE RANGE
--------------------------------------------------- */
const ranges = [
  { label: 'Last 7 days',   duration: { days: 7 } },
  { label: 'Last 14 days',  duration: { days: 14 } },
  { label: 'Last 30 days',  duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year',     duration: { years: 1 } },
]
const selectedDate = ref({ start: startOfDay(new Date()), end: endOfDay(new Date()) })
const isRangeSelected = (d: Duration) =>
  isSameDay(selectedDate.value.start, sub(new Date(), d)) &&
  isSameDay(selectedDate.value.end, new Date())
const selectRange = (d: Duration) => {
  selectedDate.value = { start: sub(new Date(), d), end: new Date() }
}

/* ---------------------------------------------------
   FILTERS
--------------------------------------------------- */
const search    = ref('')
const page      = ref(1)
const pageCount = ref('10')
const sort      = ref({ column: 'date', direction: 'desc' as const })

const isFilterOpen    = ref(false)
const minAmount       = ref<number | null>(null)
const maxAmount       = ref<number | null>(null)
const fromTypeFilter  = ref<string | null>(null)
const toTypeFilter    = ref<string | null>(null)
const draftMinAmount  = ref<number | null>(null)
const draftMaxAmount  = ref<number | null>(null)
const draftFromType   = ref<string | null>(null)
const draftToType     = ref<string | null>(null)

const accountTypeOptions = [
  { label: 'All', value: null },
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'Investment', value: 'INVESTMENT' },
]

const openFilterModal = () => {
  draftMinAmount.value  = minAmount.value
  draftMaxAmount.value  = maxAmount.value
  draftFromType.value   = fromTypeFilter.value
  draftToType.value     = toTypeFilter.value
  isFilterOpen.value    = true
}
const applyFilters = () => {
  minAmount.value      = draftMinAmount.value
  maxAmount.value      = draftMaxAmount.value
  fromTypeFilter.value = draftFromType.value
  toTypeFilter.value   = draftToType.value
  page.value = 1
  isFilterOpen.value = false
}
const resetFilters = () => {
  search.value         = ''
  minAmount.value      = null
  maxAmount.value      = null
  fromTypeFilter.value = null
  toTypeFilter.value   = null
  page.value           = 1
  selectedDate.value   = { start: startOfDay(new Date()), end: endOfDay(new Date()) }
}

watch([search, selectedDate, minAmount, maxAmount, fromTypeFilter, toTypeFilter, pageCount],
  () => { page.value = 1 }, { deep: true })

/* ---------------------------------------------------
   COLUMNS
--------------------------------------------------- */
const desktopColumns = [
  { key: 'date',    label: 'Date',    sortable: true },
  { key: 'from',    label: 'From',    sortable: false },
  { key: 'to',      label: 'To',      sortable: false },
  { key: 'amount',  label: 'Amount',  sortable: true },
  { key: 'note',    label: 'Note',    sortable: false },
  { key: 'actions', label: 'Actions' },
]
const mobileColumns = [
  { key: 'date',    label: 'Date' },
  { key: 'from',    label: 'From' },
  { key: 'to',      label: 'To' },
  { key: 'amount',  label: 'Amount' },
  { key: 'actions', label: '' },
]

const allColumns     = computed(() => isMobile.value ? mobileColumns : desktopColumns)
const selectedColumns = ref([...desktopColumns])
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))
const columnsTable   = computed(() =>
  allColumns.value.filter(c => selectedColumns.value.some((s: any) => s.key === c.key))
)
watch(allColumns, cols => { selectedColumns.value = [...cols] })

/* ---------------------------------------------------
   FETCH DATA
--------------------------------------------------- */
const queryArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    createdAt: {
      gte: startOfDay(selectedDate.value.start),
      lte: endOfDay(selectedDate.value.end),
    },
  },
  orderBy: { createdAt: 'desc' },
}))

const { data: transfers, isLoading } = useFindManyAccountTransfer(queryArgs)

/* ---------------------------------------------------
   BANKS / COMPANY
--------------------------------------------------- */
const { data: banks } = useFindManyBankAccount(() => ({
  where: { companyId: useAuth().session.value?.companyId },
}))

const { data: company } = useFindUniqueCompany(() => ({
  where: { id: useAuth().session.value?.companyId },
}))

/* ---------------------------------------------------
   HELPERS
--------------------------------------------------- */
const bankMap = computed(() => {
  const map = new Map<string, string>()
  banks.value?.forEach(b => {
    map.set(b.id, b.bankName || 'Bank')
  })
  return map
})

const getAccountLabel = (type: string, accountId?: string | null) => {
  if (type !== 'BANK') return type
  if (accountId && bankMap.value.has(accountId)) {
    return `BANK (${bankMap.value.get(accountId)})`
  }
  return 'BANK (Primary)'
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v ?? 0)

/* ---------------------------------------------------
   ALL ROWS (mapped)
--------------------------------------------------- */
const allRows = computed(() =>
  (transfers.value ?? []).map(t => ({
    id:     t.id,
    date:   t.createdAt,
    from:   getAccountLabel(t.fromType, t.fromAccountId),
    to:     getAccountLabel(t.toType, t.toAccountId),
    fromType: t.fromType,
    toType:   t.toType,
    amount: t.amount,
    note:   t.note,
    raw:    t,
  }))
)

/* ---------------------------------------------------
   CLIENT-SIDE FILTER + PAGINATE
--------------------------------------------------- */
const filtered = computed(() => {
  let rows = allRows.value
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    rows = rows.filter(r =>
      r.from.toLowerCase().includes(q) ||
      r.to.toLowerCase().includes(q) ||
      (r.note ?? '').toLowerCase().includes(q)
    )
  }
  if (fromTypeFilter.value) rows = rows.filter(r => r.fromType === fromTypeFilter.value)
  if (toTypeFilter.value)   rows = rows.filter(r => r.toType   === toTypeFilter.value)
  if (minAmount.value !== null) rows = rows.filter(r => Number(r.amount) >= minAmount.value!)
  if (maxAmount.value !== null) rows = rows.filter(r => Number(r.amount) <= maxAmount.value!)
  return rows
})

const pageFrom  = computed(() => filtered.value.length ? (page.value - 1) * Number(pageCount.value) + 1 : 0)
const pageTo    = computed(() => Math.min(page.value * Number(pageCount.value), filtered.value.length))
const paginated = computed(() =>
  filtered.value.slice((page.value - 1) * Number(pageCount.value), page.value * Number(pageCount.value))
)

/* ---------------------------------------------------
   EXCEL EXPORT
--------------------------------------------------- */
const handleDownloadExcel = async () => {
  const rows = filtered.value
  if (!rows.length) { toast.add({ title: 'No data to export', color: 'orange' }); return }
  try {
    const [{ Workbook }, { saveAs }] = await Promise.all([
      import('exceljs'), import('file-saver'),
    ])
    const workbook  = new Workbook()
    const worksheet = workbook.addWorksheet('Transfers')
    worksheet.columns = [
      { header: 'Date',   key: 'date',   width: 16 },
      { header: 'From',   key: 'from',   width: 22 },
      { header: 'To',     key: 'to',     width: 22 },
      { header: 'Amount', key: 'amount', width: 14 },
      { header: 'Note',   key: 'note',   width: 30 },
    ]
    rows.forEach((r: any) => {
      worksheet.addRow({
        date:   format(new Date(r.date), 'dd MMM yyyy'),
        from:   r.from,
        to:     r.to,
        amount: Number(r.amount),
        note:   r.note ?? '',
      })
    })
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    })
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `transfers-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    )
  } catch (err: any) {
    toast.add({ title: 'Failed to export', description: err.message, color: 'red' })
  }
}

/* ---------------------------------------------------
   ACTION DROPDOWN
--------------------------------------------------- */
const actionItems = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => openTransferForm(row.raw),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => {
        deletingRow.value = row
        isDeleteModalOpen.value = true
      },
    },
  ],
]

/* ---------------------------------------------------
   LOCALSTORAGE STATE
--------------------------------------------------- */
watch(
  [search, minAmount, maxAmount, fromTypeFilter, toTypeFilter, page, pageCount, sort, selectedColumnKeys,
   () => selectedDate.value.start, () => selectedDate.value.end],
  () => {
    transferTableStore.$patch({
      search: search.value,
      minAmount: minAmount.value,
      maxAmount: maxAmount.value,
      fromTypeFilter: fromTypeFilter.value,
      toTypeFilter: toTypeFilter.value,
      page: page.value,
      pageCount: pageCount.value,
      sort: sort.value,
      selectedDate: {
        start: selectedDate.value.start.toISOString(),
        end: selectedDate.value.end.toISOString(),
      },
      selectedColumnKeys: selectedColumnKeys.value,
    })
  },
  { deep: true }
)

onMounted(() => {
  isMobile.value = window.innerWidth < 640
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 640 })
  {
    const s = transferTableStore
    search.value         = s.search         ?? ''
    minAmount.value      = s.minAmount       ?? null
    maxAmount.value      = s.maxAmount       ?? null
    fromTypeFilter.value = s.fromTypeFilter  ?? null
    toTypeFilter.value   = s.toTypeFilter    ?? null
    page.value           = Number(s.page || 1)
    pageCount.value      = String(s.pageCount || '10')
    if (s.sort?.column) sort.value = s.sort
    if (s.selectedDate?.start && s.selectedDate?.end)
      selectedDate.value = { start: startOfDay(new Date(s.selectedDate.start)), end: endOfDay(new Date(s.selectedDate.end)) }
    if (Array.isArray(s.selectedColumnKeys) && s.selectedColumnKeys.length > 0)
      selectedColumns.value = desktopColumns.filter(c => s.selectedColumnKeys.includes(c.key))
  }
})
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UCard class="w-full" :ui="{
      divide: 'divide-y divide-gray-200 dark:divide-gray-700',
      header: { padding: 'px-4 py-5' },
      body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
      footer: { padding: 'p-4' },
    }">

      <!-- HEADER: date picker + search + new button -->
      <template #header>
        <div class="flex justify-between items-center gap-3 w-full flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <UPopover>
              <UButton icon="i-heroicons-calendar-days-20-solid">
                {{ format(selectedDate.start, 'd MMM y') }} - {{ format(selectedDate.end, 'd MMM y') }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex sm:divide-x divide-gray-200">
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton v-for="(r, i) in ranges" :key="i" :label="r.label" color="gray" variant="ghost"
                      class="rounded-none px-6"
                      :class="isRangeSelected(r.duration) ? 'bg-gray-100' : ''"
                      truncate @click="selectRange(r.duration)" />
                  </div>
                  <DatePicker v-model="selectedDate" @close="close" />
                </div>
              </template>
            </UPopover>
            <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid"
              placeholder="Search..." size="sm" class="w-56" />
          </div>
          <UButton icon="i-heroicons-plus" size="sm" color="primary" label="New Transfer"
            @click="openTransferForm()" />
        </div>
      </template>

      <!-- TOOLBAR -->
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
      <UTable v-model:sort="sort"
        :rows="paginated" :columns="columnsTable" :loading="isLoading"
        class="w-full">

        <template #date-data="{ row }">
          {{ format(new Date(row.date), 'dd MMM yyyy') }}
        </template>

        <template #amount-data="{ row }">
          {{ formatCurrency(row.amount) }}
        </template>

        <template #actions-data="{ row }">
          <UDropdown :items="actionItems(row)">
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
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
              default: { activeButton: { variant: 'outline' } },
            }" />
        </div>
      </template>
    </UCard>

    <!-- DELETE MODAL -->
    <UDashboardModal v-model="isDeleteModalOpen"
      title="Delete Transfer"
      description="Are you sure you want to delete this transfer?"
      icon="i-heroicons-exclamation-circle"
      prevent-close :close-button="null"
      :ui="{ icon: { base: 'text-red-500' } as any, footer: { base: 'ml-16' } as any }">
      <template #footer>
        <UButton color="red" label="Delete" @click="confirmDelete" />
        <UButton color="gray" label="Cancel" @click="isDeleteModalOpen = false" />
      </template>
    </UDashboardModal>

    <!-- FORM MODAL -->
    <UModal v-model="showTransferForm">
      <AccountTransferForm
        :transfer="selectedTransfer"
        :loading="createTransfer.isPending.value || updateTransfer.isPending.value"
        @save="saveTransfer"
        @cancel="closeTransferForm"
      />
    </UModal>

    <!-- FILTER MODAL -->
    <UModal v-model="isFilterOpen">
      <UCard>
        <template #header><div class="text-base font-semibold">Filters</div></template>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm text-gray-500 mb-1 block">From Account</label>
              <USelect v-model="draftFromType" :options="accountTypeOptions" value-attribute="value" option-attribute="label" />
            </div>
            <div>
              <label class="text-sm text-gray-500 mb-1 block">To Account</label>
              <USelect v-model="draftToType" :options="accountTypeOptions" value-attribute="value" option-attribute="label" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UInput v-model.number="draftMinAmount" type="number" placeholder="Min Amount" />
            <UInput v-model.number="draftMaxAmount" type="number" placeholder="Max Amount" />
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
