<script setup lang="ts">
import {
  useFindManyDistributorPayment,
  useCountDistributorPayment,
  useFindManyDistributorCompany,
  useCreateDistributorPayment,
} from '~/lib/hooks'
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

// -------------------------------------
// COMPUTED
// -------------------------------------
const companyId = computed(
  () => useAuth().session.value?.companyId
)

// -------------------------------------
// HELPERS
// -------------------------------------
const formatCurrency = (amount: any) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(amount || 0))

const showToast = (
  title: string,
  color: 'green' | 'red' | 'yellow' = 'green',
  description = ''
) => {
  toast.add({ title, color, description })
}

// -------------------------------------
// TABLE COLUMNS
// -------------------------------------
const columns = [
  { key: 'paymentNo', label: 'Payment No.', sortable: true },
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'distributorName', label: 'Distributor' },
  { key: 'purchaseOrderNo', label: 'PO No.' },
  { key: 'paymentType', label: 'Payment', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'remarks', label: 'Remarks' },
  { key: 'actions', label: 'Actions' },
]

// -------------------------------------
// FILTERS & PAGINATION
// -------------------------------------
const dateSerializer = {
  read: (value: string) => {
    const parsed = JSON.parse(value)
    return { start: new Date(parsed.start), end: new Date(parsed.end) }
  },
  write: (value: { start: Date; end: Date }) => JSON.stringify({
    start: value.start.toISOString(),
    end: value.end.toISOString(),
  }),
}

const search = useLocalStorage('dist:payments-page:search', '')
const sort = useLocalStorage('dist:payments-page:sort', { column: 'createdAt', direction: 'desc' as const })
const page = useLocalStorage('dist:payments-page:page', 1)
const pageCount = useLocalStorage('dist:payments-page:pageCount', 10)
const normalizedPageCount = computed(() => Number(pageCount.value) || 10)

const changePageCount = (value: number | string) => {
  page.value = 1
  pageCount.value = Number(value) || 10
}

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } },
]

const selectedDate = useLocalStorage(
  'dist:payments-page:date',
  { start: sub(new Date(), { days: 7 }), end: new Date() },
  { serializer: dateSerializer },
)

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const paymentTypeFilter = useLocalStorage('dist:payments-page:paymentType', '')

const isFilterModalOpen = ref(false)
const draftPaymentTypeFilter = ref('')

const paymentTypeFilterOptions = [
  { label: 'All', value: '' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'CARD' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Credit', value: 'CREDIT' },
]

const openFilterModal = () => {
  draftPaymentTypeFilter.value = paymentTypeFilter.value
  isFilterModalOpen.value = true
}

const applyFilters = () => {
  paymentTypeFilter.value = draftPaymentTypeFilter.value
  page.value = 1
  isFilterModalOpen.value = false
}

const resetFilters = () => {
  search.value = ''
  selectedDate.value = { start: sub(new Date(), { days: 7 }), end: new Date() }
  paymentTypeFilter.value = ''
  page.value = 1
}

watch([search, selectedDate, paymentTypeFilter], () => {
  page.value = 1
}, { deep: true })

// -------------------------------------
// QUERY
// -------------------------------------
const searchWhere = computed(() => {
  const q = search.value.trim()
  if (!q) return {}

  const num = Number(q)
  const numericMatch = q !== '' && !Number.isNaN(num) ? { paymentNo: num } : null

  return {
    OR: [
      ...(numericMatch ? [numericMatch] : []),
      { remarks: { contains: q, mode: 'insensitive' } },
      { billNo: { contains: q, mode: 'insensitive' } },
      {
        distributorCompany: {
          distributor: { name: { contains: q, mode: 'insensitive' } },
        },
      },
    ],
  }
})

const queryArgs = computed(() => ({
  where: {
    companyId: companyId.value,
    createdAt: {
      gte: startOfDay(selectedDate.value.start),
      lte: endOfDay(selectedDate.value.end),
    },
    ...(paymentTypeFilter.value ? { paymentType: paymentTypeFilter.value } : {}),
    ...searchWhere.value,
  },
  select: {
    id: true,
    createdAt: true,
    paymentNo: true,
    amount: true,
    remarks: true,
    billNo: true,
    paymentType: true,
    distributorId: true,

    purchaseOrder: {
      select: {
        id: true,
        purchaseOrderNo: true,
      },
    },

    distributorCompany: {
      select: {
        distributor: {
          select: {
            name: true,
          },
        },
      },
    },
  },
  orderBy: {
    [sort.value.column]: sort.value.direction,
  },
  skip: (page.value - 1) * normalizedPageCount.value,
  take: normalizedPageCount.value,
}))

// -------------------------------------
// FETCH
// -------------------------------------
const {
  data: payments,
  isLoading,
  refetch,
} = useFindManyDistributorPayment(queryArgs)

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}))

const { data: pageTotal, refetch: refetchCount } = useCountDistributorPayment(countArgs)

// -------------------------------------
// FINAL ROWS
// -------------------------------------
const rows = computed(() =>
  payments.value?.map(p => ({
    ...p,
    distributorName: p.distributorCompany?.distributor?.name || '-',
    purchaseOrderId: p.purchaseOrder?.id ?? null,
    purchaseOrderNo: p.purchaseOrder?.purchaseOrderNo ?? '-',
  })) ?? []
)

// -------------------------------------
// DOWNLOAD
// -------------------------------------
const isDownloading = ref(false)

async function triggerDownload(filename: string, blob: Blob) {
  const objectUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(objectUrl)
}

const downloadPayments = async (fileFormat: 'excel' | 'pdf') => {
  isDownloading.value = true
  try {
    const res = await $fetch.raw(`/api/downloads/distributor-payments.${fileFormat}`, {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start).toISOString(),
        endDate: endOfDay(selectedDate.value.end).toISOString(),
        search: search.value || undefined,
        paymentType: paymentTypeFilter.value || undefined,
      },
    })

    const ext = fileFormat === 'excel' ? 'xlsx' : 'pdf'
    const mime = fileFormat === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf'

    await triggerDownload(`distributor-payments.${ext}`, new Blob([res._data as ArrayBuffer], { type: mime }))
  } catch (err: any) {
    showToast('Download failed', 'red', err.message)
  } finally {
    isDownloading.value = false
  }
}

const downloadItems = [[
  { label: 'Excel (.xlsx)', icon: 'i-heroicons-table-cells', click: () => downloadPayments('excel') },
  { label: 'PDF', icon: 'i-heroicons-document-text', click: () => downloadPayments('pdf') },
]]

// -------------------------------------
// ADD PAYMENT
// -------------------------------------
const isAddOpen = ref(false)
const isSaving = ref(false)
const editingPaymentId = ref<string | null>(null)
const paymentToEdit = ref<any>(null)
const isDeleteOpen = ref(false)
const isDeleting = ref(false)
const paymentToDelete = ref<any>(null)

const addForm = ref({
  distributorId: '' as string,
  purchaseOrderId: '' as string,
  amount: null as number | null,
  paymentType: 'CASH',
  remarks: '',
  date: new Date().toISOString().split('T')[0], // yyyy-mm-dd
})

const resetAddForm = () => {
  addForm.value = {
    distributorId: '',
    purchaseOrderId: '',
    amount: null,
    paymentType: 'CASH',
    remarks: '',
    date: new Date().toISOString().split('T')[0],
  }
}

// distributor options for the Add Payment modal
const distributorQueryArgs = computed(() => ({
  where: { companyId: companyId.value },
  select: {
    distributorId: true,
    distributor: { select: { name: true } },
    purchaseOrders: {
      select: {
        id: true,
        purchaseOrderNo: true,
        billNo: true,
        totalAmount: true,
      },
      orderBy: { createdAt: 'desc' },
    },
  },
  orderBy: { distributor: { name: 'asc' } },
}))

const {
  data: distributorCompanies,
  refetch: refetchDistributorCompanies,
} = useFindManyDistributorCompany(distributorQueryArgs)

onMounted(() => {
  refetch()
  refetchCount()
  refetchDistributorCompanies()
})

const distributorOptions = computed(() =>
  (distributorCompanies.value ?? []).map((dc: any) => ({
    label: dc.distributor?.name || '-',
    value: dc.distributorId,
  }))
)

const purchaseOrderOptions = computed(() => {
  const distributorCompany = (distributorCompanies.value ?? []).find(
    (dc: any) => dc.distributorId === addForm.value.distributorId
  )

  return (distributorCompany?.purchaseOrders ?? []).map((po: any) => ({
    label: `PO#${po.purchaseOrderNo ?? '-'}${po.billNo ? ` / ${po.billNo}` : ''} — ${formatCurrency(po.totalAmount)}`,
    value: po.id,
  }))
})

const selectDistributor = (distributorId: string) => {
  addForm.value.distributorId = distributorId
  addForm.value.purchaseOrderId = ''
}

const openAddModal = () => {
  resetAddForm()
  editingPaymentId.value = null
  paymentToEdit.value = null
  isAddOpen.value = true
}

const openEditModal = (row: any) => {
  editingPaymentId.value = row.id
  paymentToEdit.value = row
  addForm.value = {
    distributorId: row.distributorId,
    purchaseOrderId: row.purchaseOrderId || '',
    amount: Number(row.amount),
    paymentType: row.paymentType || 'CASH',
    remarks: row.remarks || '',
    date: new Date(row.createdAt).toISOString().split('T')[0],
  }
  isAddOpen.value = true
}

const confirmDeletePayment = (row: any) => {
  paymentToDelete.value = row
  isDeleteOpen.value = true
}

const deletePayment = async () => {
  if (!paymentToDelete.value?.id) return
  isDeleting.value = true
  try {
    await $fetch(`/api/distributor/payments/${paymentToDelete.value.id}`, { method: 'DELETE' })
    showToast('Payment deleted successfully')
    isDeleteOpen.value = false
    paymentToDelete.value = null
    await refetch()
  } catch (err: any) {
    showToast('Delete failed', 'red', err.message)
  } finally {
    isDeleting.value = false
  }
}

const paymentActions = (row: any) => [[
  { label: 'Edit', icon: 'i-heroicons-pencil-square-20-solid', click: () => openEditModal(row) },
], [
  { label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => confirmDeletePayment(row) },
]]

const CreateDistributorPayment = useCreateDistributorPayment()

const handleAddPayment = async () => {
  isSaving.value = true

  try {
    if (!editingPaymentId.value && !addForm.value.distributorId) {
      showToast('Please select a distributor', 'red')
      return
    }

    if (!addForm.value.amount || addForm.value.amount <= 0) {
      showToast('Please enter valid Amount', 'red')
      return
    }

    const createdAtDate = addForm.value.date
      ? new Date(addForm.value.date)
      : new Date()

    if (editingPaymentId.value) {
      await $fetch(`/api/distributor/payments/${editingPaymentId.value}`, {
        method: 'PUT',
        body: {
          amount: addForm.value.amount,
          paymentType: addForm.value.paymentType,
          remarks: addForm.value.remarks || null,
          billNo: paymentToEdit.value?.billNo || null,
          purchaseOrderId: addForm.value.purchaseOrderId || null,
          createdAt: createdAtDate,
        },
      })
      showToast('Payment updated successfully')
      isAddOpen.value = false
      editingPaymentId.value = null
      paymentToEdit.value = null
      resetAddForm()
      await refetch()
      return
    }

    const expenseData = {
      totalAmount: addForm.value.amount,
      note: addForm.value.remarks || null,
      paymentMode: addForm.value.paymentType,
      status: 'Paid',
      companyId: companyId.value,
      userId: useAuth().session.value?.userId,
      expensecategoryId: useAuth().session.value?.purchaseExpenseCategoryId,
      createdAt: createdAtDate,
    }

    await CreateDistributorPayment.mutateAsync({
      data: {
        amount: addForm.value.amount,
        paymentType: addForm.value.paymentType,
        createdAt: createdAtDate,

        ...(addForm.value.remarks
          ? { remarks: addForm.value.remarks }
          : {}),

        distributorCompany: {
          connect: {
            distributorId_companyId: {
              distributorId: addForm.value.distributorId,
              companyId: companyId.value,
            },
          },
        },

        ...(addForm.value.purchaseOrderId
          ? {
              purchaseOrder: {
                connect: { id: addForm.value.purchaseOrderId },
              },
            }
          : {}),

        expense: {
          create: expenseData,
        },
      },
      select: { id: true },
    })

    showToast('Payment added successfully', 'green')
    isAddOpen.value = false
    resetAddForm()
    refetch()
  } catch (err: any) {
    showToast('Error', 'red', err.message)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
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
      <!-- HEADER -->
      <template #header>
        <div class="flex flex-col sm:flex-row justify-between gap-3 w-full">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
              placeholder="Search by distributor, remarks..."
              class="w-full sm:w-72"
            />
          </div>

          <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            label="New Payment"
            @click="openAddModal"
          />
        </div>
      </template>

      <!-- TABLE CONTROLS -->
      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm hidden sm:block">Rows per page:</span>
          <USelect
            :model-value="pageCount"
            :options="[5, 10, 20, 30]"
            class="me-2 w-20"
            size="xs"
            @update:model-value="changePageCount"
          />
        </div>

        <div class="flex gap-1.5 items-center">
          <UDropdown :items="downloadItems" :ui="{ width: 'w-36' }">
            <UButton
              icon="i-heroicons-arrow-down-tray"
              color="gray"
              size="xs"
              trailing
              :loading="isDownloading"
              :disabled="isDownloading"
            >
              Download
            </UButton>
          </UDropdown>

          <UButton
            icon="i-heroicons-funnel"
            color="gray"
            size="xs"
            @click="openFilterModal"
          >
            Filters
          </UButton>

          <UButton
            icon="i-heroicons-arrow-path"
            color="gray"
            size="xs"
            @click="resetFilters"
          >
            Reset
          </UButton>
        </div>
      </div>

      <!-- TABLE -->
      <UTable
        v-model:sort="sort"
        :rows="rows"
        :columns="columns"
        :loading="isLoading"
        sort-asc-icon="i-heroicons-arrow-up"
        sort-desc-icon="i-heroicons-arrow-down"
        sort-mode="manual"
        class="w-full"
      >
        <!-- PAYMENT NO -->
        <template #paymentNo-data="{ row }">
          {{ row.paymentNo ?? '-' }}
        </template>

        <!-- DATE -->
        <template #createdAt-data="{ row }">
          {{
            new Date(row.createdAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit'
            })
          }}
        </template>

        <!-- DISTRIBUTOR -->
        <template #distributorName-data="{ row }">
          {{ row.distributorName }}
        </template>

        <!-- PO NO -->
        <template #purchaseOrderNo-data="{ row }">
          {{ row.purchaseOrderNo }}
        </template>

        <!-- PAYMENT TYPE -->
        <template #paymentType-data="{ row }">
          <UBadge color="green" variant="subtle">
            {{ row.paymentType || '-' }}
          </UBadge>
        </template>

        <!-- AMOUNT -->
        <template #amount-data="{ row }">
          <span class="font-medium">{{ formatCurrency(row.amount) }}</span>
        </template>

        <!-- REMARKS -->
        <template #remarks-data="{ row }">
          {{ row.remarks || '-' }}
        </template>

        <template #actions-data="{ row }">
          <UDropdown :items="paymentActions(row)">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal-20-solid"
            />
          </UDropdown>
        </template>
      </UTable>

      <!-- FOOTER -->
      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm hidden sm:block">
            Showing
            <span class="font-medium">{{ pageTotal ? (page - 1) * normalizedPageCount + 1 : 0 }}</span>
            to
            <span class="font-medium">
              {{ Math.min(page * normalizedPageCount, pageTotal) }}
            </span>
            of
            <span class="font-medium">{{ pageTotal }}</span>
            results
          </span>

          <UPagination
            v-model="page"
            :page-count="normalizedPageCount"
            :total="pageTotal"
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
            }"
          />
        </div>
      </template>
    </UCard>

    <!-- ADD PAYMENT MODAL -->
    <UModal v-model="isAddOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">{{ editingPaymentId ? 'Edit Payment' : 'New Payment' }}</div>
        </template>

        <div class="space-y-4">
          <!-- DISTRIBUTOR -->
          <UFormGroup label="Distributor" required>
            <USelectMenu
              :model-value="addForm.distributorId"
              :options="distributorOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Select distributor"
              searchable
              searchable-placeholder="Search distributor..."
              :disabled="!!editingPaymentId"
              @update:model-value="selectDistributor"
            />
          </UFormGroup>

          <UFormGroup label="Purchase Order">
            <USelectMenu
              v-model="addForm.purchaseOrderId"
              :options="purchaseOrderOptions"
              option-attribute="label"
              value-attribute="value"
              :placeholder="addForm.distributorId ? 'Select purchase order (optional)' : 'Select distributor first'"
              searchable
              searchable-placeholder="Search purchase order..."
              :disabled="!addForm.distributorId"
            />
          </UFormGroup>

          <!-- PAYMENT DATE -->
          <UFormGroup label="Payment Date">
            <UInput type="date" v-model="addForm.date" />
          </UFormGroup>

          <!-- AMOUNT -->
          <UFormGroup label="Amount" required>
            <UInput
              v-model.number="addForm.amount"
              type="number"
              placeholder="Enter amount"
            />
          </UFormGroup>

          <!-- PAYMENT TYPE -->
          <UFormGroup label="Payment Type">
            <USelect
              v-model="addForm.paymentType"
              :options="[
                { label: 'Cash', value: 'CASH' },
                { label: 'Bank', value: 'BANK' },
                { label: 'UPI', value: 'UPI' },
                { label: 'Card', value: 'CARD' },
                { label: 'Cheque', value: 'CHEQUE' },
              ]"
              option-attribute="label"
              value-attribute="value"
              placeholder="Payment Type"
            />
          </UFormGroup>

          <!-- REMARKS -->
          <UFormGroup label="Remarks">
            <UInput
              v-model="addForm.remarks"
              placeholder="Optional remarks"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="w-full flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isAddOpen = false">Cancel</UButton>
            <UButton color="primary" :loading="isSaving" @click="handleAddPayment">
              {{ editingPaymentId ? 'Save' : 'Submit' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <UModal v-model="isDeleteOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Delete Payment</div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-300">
          Delete payment {{ paymentToDelete?.paymentNo ? `#${paymentToDelete.paymentNo}` : '' }} for
          {{ formatCurrency(paymentToDelete?.amount) }}? This action cannot be undone.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isDeleteOpen = false">Cancel</UButton>
            <UButton color="red" :loading="isDeleting" @click="deletePayment">Delete</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- FILTER MODAL -->
    <UModal v-model="isFilterModalOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Payment Filters</div>
        </template>

        <div class="space-y-3">
          <USelect
            v-model="draftPaymentTypeFilter"
            :options="paymentTypeFilterOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="Payment Type"
          />
        </div>

        <template #footer>
          <div class="w-full flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isFilterModalOpen = false">Cancel</UButton>
            <UButton color="primary" @click="applyFilters">Apply Filter</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
