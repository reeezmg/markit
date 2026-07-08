<script setup lang="ts">
import {
  useFindManyPurchaseOrder,
  useCountPurchaseOrder,
  useDeletePurchaseOrder,
  useCreateDistributorPayment,
} from '~/lib/hooks'
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

const toast = useToast()
const router = useRouter()
const useAuth = () => useNuxtApp().$auth

// -------------------------------------
// STATE
// -------------------------------------
const isDeleting = ref(false)
const isDeleteModalOpen = ref(false)
const deletingRowIdentinty = ref<any>(null)

const isAdd = ref(false)
const isOpenPay = ref(false)
const isDetailsOpen = ref(false)
const isSaving = ref(false)

const selectedRow = ref<any>(null)
const selectedDetailsRow = ref<any>(null)

// -------------------------------------
// FORM STATE
// -------------------------------------
const form = ref({
  amount: null as number | null,
  paymentType: 'CASH',
  remarks: '',
  date: new Date().toISOString().split('T')[0], // yyyy-mm-dd
})

// -------------------------------------
// COMPUTED
// -------------------------------------
const companyId = computed(
  () => useAuth().session.value?.companyId
)

const distributorId = computed(
  () => selectedRow.value?.distributorId
)

const companyName = computed(
  () => useAuth().session.value?.companyName || 'Purchase Order'
)

const companyAddress = computed(
  () => useAuth().session.value?.address || {}
)

const companyGstin = computed(
  () => useAuth().session.value?.gstin || ''
)

// -------------------------------------
// HELPERS
// -------------------------------------
const resetForm = () => {
  form.value = {
    amount: null,
    paymentType: 'CASH',
    remarks: '',
    date: new Date().toISOString().split('T')[0],
  }
}

const showToast = (
  title: string,
  color: 'green' | 'red' | 'yellow' = 'green',
  description = ''
) => {
  toast.add({ title, color, description })
}

const formatCurrency = (amount: any) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(amount || 0))

const formatDate = (date: any) =>
  date
    ? new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '-'

const formatAddress = (address: any) =>
  [
    address?.street,
    address?.locality,
    address?.city,
    address?.state,
    address?.pincode,
  ]
    .filter(Boolean)
    .join(', ')

// -------------------------------------
// MUTATIONS
// -------------------------------------
const DeletePurchaseOrder = useDeletePurchaseOrder({
  optimisticUpdate: true,
})

const CreateDistributorPayment = useCreateDistributorPayment()

// -------------------------------------
// TABLE COLUMNS
// -------------------------------------
const columns = [
  { key: 'purchaseOrderNo', label: 'PO No.', sortable: true },
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'paymentType', label: 'Payment', sortable: true },
  { key: 'totalAmount', label: 'Total Amount', sortable: true },
  { key: 'qty', label: 'Qty' },
  { key: 'due', label: 'Due' },
  { key: 'actions', label: 'Actions' },
]

// -------------------------------------
// FILTERS & PAGINATION
// -------------------------------------
const search = ref('')
const sort = ref({ column: 'purchaseOrderNo', direction: 'desc' as const })
const expand = ref({ openedRows: [], row: null })
const page = ref(1)
const pageCount = ref(10)

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } },
]

const selectedDate = ref({
  start: sub(new Date(), { days: 7 }),
  end: new Date(),
})

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const paymentTypeFilter = ref('')
const minTotalFilter = ref<number | null>(null)
const maxTotalFilter = ref<number | null>(null)

const isFilterModalOpen = ref(false)
const draftPaymentTypeFilter = ref('')
const draftMinTotalFilter = ref<number | null>(null)
const draftMaxTotalFilter = ref<number | null>(null)

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
  draftMinTotalFilter.value = minTotalFilter.value
  draftMaxTotalFilter.value = maxTotalFilter.value
  isFilterModalOpen.value = true
}

const applyFilters = () => {
  paymentTypeFilter.value = draftPaymentTypeFilter.value
  minTotalFilter.value = draftMinTotalFilter.value
  maxTotalFilter.value = draftMaxTotalFilter.value
  page.value = 1
  isFilterModalOpen.value = false
}

const resetFilters = () => {
  search.value = ''
  selectedDate.value = { start: sub(new Date(), { days: 7 }), end: new Date() }
  paymentTypeFilter.value = ''
  minTotalFilter.value = null
  maxTotalFilter.value = null
  page.value = 1
}

watch([search, selectedDate, paymentTypeFilter, minTotalFilter, maxTotalFilter], () => {
  page.value = 1
}, { deep: true })

// -------------------------------------
// QUERY
// -------------------------------------
const searchWhere = computed(() => {
  const q = search.value.trim()
  if (!q) return {}

  const num = Number(q)
  const numericMatch = q !== '' && !Number.isNaN(num) ? { purchaseOrderNo: num } : null

  return {
    OR: [
      ...(numericMatch ? [numericMatch] : []),
      { billNo: { contains: q, mode: 'insensitive' } },
    ],
  }
})

const totalAmountWhere = computed(() => {
  if (minTotalFilter.value === null && maxTotalFilter.value === null) return {}

  return {
    totalAmount: {
      ...(minTotalFilter.value !== null ? { gte: minTotalFilter.value } : {}),
      ...(maxTotalFilter.value !== null ? { lte: maxTotalFilter.value } : {}),
    },
  }
})

const queryArgs = computed(() => ({
  where: {
    companyId: companyId.value,
    products: { some: {} },
    createdAt: {
      gte: startOfDay(selectedDate.value.start),
      lte: endOfDay(selectedDate.value.end),
    },
    ...(paymentTypeFilter.value ? { paymentType: paymentTypeFilter.value } : {}),
    ...totalAmountWhere.value,
    ...searchWhere.value,
  },
  select: {
    id: true,
    createdAt: true,
    paymentType: true,
    totalAmount: true,
    purchaseOrderNo: true,
    billNo: true,
    subTotalAmount: true,
    discount: true,
    tax: true,
    adjustment: true,

    distributorCompany: {
      select: {
        distributorId: true,
        distributor: {
          select: {
            name: true,
            gstin: true,
            address: {
              select: {
                street: true,
                locality: true,
                city: true,
                state: true,
                pincode: true,
              },
            },
          },
        },
      },
    },

    distributorPayment: {
      select: {
        id: true,
        amount: true,
        paymentType: true,
        createdAt: true,
        remarks: true,
      },
      orderBy: { createdAt: 'desc' },
    },

    products: {
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        variants: {
          select: {
            id: true,
            name: true,
            code: true,
            unit: true,
            pprice: true,
            sprice: true,
            items: {
              select: {
                id: true,
                size: true,
                barcode: true,
                initialQty: true,
              },
            },
          },
        },
      },
    },
  },
  orderBy: {
    [sort.value.column]: sort.value.direction,
  },
  skip: (page.value - 1) * pageCount.value,
  take: pageCount.value,
}))

// -------------------------------------
// FETCH
// -------------------------------------
const {
  data: purchaseOrders,
  isLoading,
  refetch,
} = useFindManyPurchaseOrder(queryArgs)

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}))

const { data: pageTotal } = useCountPurchaseOrder(countArgs)

// -------------------------------------
// CALCULATIONS
// -------------------------------------
const asArray = (value: any) => Array.isArray(value) ? value : []

const getPurchaseOrderQty = (po: any) =>
  asArray(po?.products).reduce(
    (sum: number, p: any) =>
      sum +
      asArray(p?.variants).reduce(
        (vSum: number, v: any) =>
          vSum +
          asArray(v?.items).reduce(
            (iSum: number, i: any) => iSum + (i.initialQty ?? 0),
            0
          ),
        0
      ),
    0
  )

const getDueAmount = (po: any) => {
  if (po?.paymentType !== 'CREDIT') return null

  const paid =
    asArray(po?.distributorPayment).reduce(
      (sum: number, p: any) => sum + (p.amount ?? 0),
      0
    )

  return (po?.totalAmount ?? 0) - paid
}

const getPaidAmount = (po: any) =>
  asArray(po?.distributorPayment).reduce(
    (sum: number, p: any) => sum + Number(p.amount || 0),
    0
  )

const purchaseOrderLineRows = (po: any) => {
  const lines: any[] = []

  asArray(po?.products).forEach((product: any) => {
    asArray(product?.variants).forEach((variant: any) => {
      asArray(variant?.items).forEach((item: any) => {
        const qty = Number(item?.initialQty || 0)
        const rate = Number(variant?.pprice || 0)

        lines.push({
          id: item?.id || `${product?.id}-${variant?.id}-${item?.size || lines.length}`,
          productName: product?.name || '-',
          categoryName: product?.category?.name || '-',
          brandName: product?.brand?.name || '-',
          variantName: variant?.name || '-',
          size: item?.size || '-',
          barcode: item?.barcode || '-',
          qty,
          unit: variant?.unit || 'Nos',
          rate,
          amount: qty * rate,
        })
      })
    })
  })

  return lines
}

const detailsLines = computed(() =>
  purchaseOrderLineRows(selectedDetailsRow.value)
)

const detailsQty = computed(() =>
  detailsLines.value.reduce((sum: number, line: any) => sum + Number(line.qty || 0), 0)
)

const detailsItemsTotal = computed(() =>
  detailsLines.value.reduce((sum: number, line: any) => sum + Number(line.amount || 0), 0)
)

// -------------------------------------
// FINAL ROWS
// -------------------------------------
const rows = computed(() =>
  purchaseOrders.value?.map(po => ({
    ...po,
    qty: getPurchaseOrderQty(po),
    due: getDueAmount(po),
    distributorId: po.distributorCompany?.distributorId,
    distributor: po.distributorCompany?.distributor,
  })) ?? []
)

// -------------------------------------
// ACTION HANDLERS
// -------------------------------------
const isDownloading = ref(false)

async function triggerDownload(url: string, filename: string, blob: Blob) {
  const objectUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(objectUrl)
}

const downloadPurchaseOrders = async (format: 'excel' | 'pdf') => {
  isDownloading.value = true
  try {
    const res = await $fetch.raw(`/api/downloads/purchase-orders.${format}`, {
      method: 'GET',
      params: {
        startDate: startOfDay(selectedDate.value.start).toISOString(),
        endDate: endOfDay(selectedDate.value.end).toISOString(),
        search: search.value || undefined,
        paymentType: paymentTypeFilter.value || undefined,
        minTotal: minTotalFilter.value ?? undefined,
        maxTotal: maxTotalFilter.value ?? undefined,
      },
    })

    const ext = format === 'excel' ? 'xlsx' : 'pdf'
    const mime = format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf'

    await triggerDownload('', `purchase-orders.${ext}`, new Blob([res._data as ArrayBuffer], { type: mime }))
  } catch (err: any) {
    showToast('Download failed', 'red', err.message)
  } finally {
    isDownloading.value = false
  }
}

const downloadItems = [[
  { label: 'Excel (.xlsx)', icon: 'i-heroicons-table-cells', click: () => downloadPurchaseOrders('excel') },
  { label: 'PDF', icon: 'i-heroicons-document-text', click: () => downloadPurchaseOrders('pdf') },
]]

const openEdit = (row: any) => {
  router.push({
    path: '/products/add',
    query: {
      poId: row.id,
      isEdit: 'true',
      from: 'distributor-purchase-order',
      returnTo: '/distributor/purchaseOrder',
    },
  })
}

const confirmDelete = (row: any) => {
  deletingRowIdentinty.value = row
  isDeleteModalOpen.value = true
}

const openPayModal = (row: any) => {
  selectedRow.value = row
  resetForm()
  isOpenPay.value = true
}

const openDetailsModal = (row: any) => {
  selectedDetailsRow.value = row
  isDetailsOpen.value = true
}

const printPurchaseOrder = async (row?: any) => {
  if (row) {
    selectedDetailsRow.value = row
    isDetailsOpen.value = true
  }

  await nextTick()
  window.print()
}

// -------------------------------------
// PAY HANDLER (FINAL + SAFE)
// -------------------------------------
const handlePay = async () => {
  isSaving.value = true

  try {
    if (!form.value.amount || form.value.amount <= 0) {
      showToast('Please enter valid Amount', 'red')
      return
    }

    if (!selectedRow.value?.id) {
      showToast('Purchase Order not found', 'red')
      return
    }

    if (!distributorId.value) {
      showToast('Distributor not linked to this purchase order', 'red')
      return
    }

    // 🔒 Freeze reactive values
    const distributorIdValue = distributorId.value
    const createdAtDate = form.value.date
      ? new Date(form.value.date)
      : new Date()

    const expenseData = {
      totalAmount: form.value.amount,
      note: form.value.remarks || null,
      paymentMode: form.value.paymentType,
      status: 'Paid',
      companyId: companyId.value,
      userId: useAuth().session.value?.userId,
      expensecategoryId:
        useAuth().session.value?.purchaseExpenseCategoryId,
      createdAt: createdAtDate,
    }

    await CreateDistributorPayment.mutateAsync({
      data: {
        amount: form.value.amount,
        paymentType: form.value.paymentType,
        createdAt: createdAtDate,

        ...(form.value.remarks
          ? { remarks: form.value.remarks }
          : {}),

        purchaseOrder: {
          connect: { id: selectedRow.value.id },
        },

        distributorCompany: {
          connect: {
            distributorId_companyId: {
              distributorId: distributorIdValue,
              companyId: companyId.value,
            },
          },
        },

        expense: {
          create: expenseData,
        },
      },
      select: { id: true },
    })

    showToast('Payment added successfully', 'green')
    isOpenPay.value = false
    resetForm()
    refetch()
  } catch (err: any) {
    showToast('Error', 'red', err.message)
  } finally {
    isSaving.value = false
  }
}

// -------------------------------------
// ADD PURCHASE ORDER
// -------------------------------------
const handleAdd = async () => {
  try {
    isAdd.value = true
    router.push({
      path: '/products/add',
      query: {
        from: 'distributor-purchase-order',
        returnTo: '/distributor/purchaseOrder',
      },
    })
  } catch (error) {
    console.error('Failed to open purchase order flow:', error)
  } finally {
    isAdd.value = false
  }
}

// -------------------------------------
// DROPDOWN ITEMS
// -------------------------------------
const action = (row: any) => {
  const items: any[] = [
    [
      {
        label: 'Details',
        icon: 'i-heroicons-document-text-20-solid',
        click: () => openDetailsModal(row),
      },
      {
        label: 'Print',
        icon: 'i-heroicons-printer-20-solid',
        click: () => printPurchaseOrder(row),
      },
      {
        label: 'Edit',
        icon: 'i-heroicons-pencil-square-20-solid',
        click: () => openEdit(row),
      },
    ],
  ]

  if (row.paymentType === 'CREDIT') {
    items.push([
      {
        label: 'Pay',
        icon: 'i-heroicons-banknotes-20-solid',
        click: () => openPayModal(row),
      },
    ])
  }

  items.push([
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => confirmDelete(row),
    },
  ])

  return items
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
              placeholder="Search Purchase Orders..."
              class="w-full sm:w-60"
            />
          </div>

          <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            label="New PO"
            :loading="isAdd"
            @click="handleAdd"
          />
        </div>
      </template>

      <!-- TABLE CONTROLS -->
      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm hidden sm:block">Rows per page:</span>
          <USelect
            v-model="pageCount"
            :options="[5, 10, 20, 30]"
            class="me-2 w-20"
            size="xs"
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
        v-model:expand="expand"
        :rows="rows"
        :columns="columns"
        :loading="isLoading"
        sort-asc-icon="i-heroicons-arrow-up"
        sort-desc-icon="i-heroicons-arrow-down"
        sort-mode="manual"
        :multiple-expand="false"
        class="w-full"
      >
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

        <!-- QTY -->
        <template #qty-data="{ row }">
          {{ row.qty }}
        </template>

        <!-- PAYMENT TYPE -->
        <template #paymentType-data="{ row }">
          <UBadge color="blue" variant="subtle">
            {{ row.paymentType || '-' }}
          </UBadge>
        </template>

        <!-- DUE -->
        <template #due-data="{ row }">
          <span
            v-if="row.due !== null"
            class="font-semibold text-red-600"
          >
            ₹{{ row.due.toFixed(2) }}
          </span>
          <span v-else>-</span>
        </template>

        <!-- ACTIONS -->
        <template #actions-data="{ row }">
          <UDropdown :items="action(row)">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal-20-solid"
            />
          </UDropdown>
        </template>

        <!-- EXPANDED ROW -->
        <template #expand="{ row }">
          <div class="p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
            <h3 class="text-sm font-semibold mb-3">
              Distributor Payments
            </h3>

            <div v-if="row.distributorPayment?.length">
              <table class="w-full text-sm border border-gray-200 dark:border-gray-700">
                <thead class="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th class="px-3 py-2 text-left">Date</th>
                    <th class="px-3 py-2 text-left">Type</th>
                    <th class="px-3 py-2 text-right">Amount</th>
                    <th class="px-3 py-2 text-left">Remarks</th>
                  </tr>
                </thead>

                <tbody>
                  <tr
                    v-for="payment in row.distributorPayment"
                    :key="payment.id"
                    class="border-t border-gray-200 dark:border-gray-700"
                  >
                    <td class="px-3 py-2">
                      {{
                        new Date(payment.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit'
                        })
                      }}
                    </td>

                    <td class="px-3 py-2">
                      <UBadge size="xs" color="green" variant="subtle">
                        {{ payment.paymentType }}
                      </UBadge>
                    </td>

                    <td class="px-3 py-2 text-right font-medium">
                      ₹{{ payment.amount.toFixed(2) }}
                    </td>

                    <td class="px-3 py-2">
                      {{ payment.remarks || '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="text-sm text-gray-500">
              No distributor payments found.
            </div>
          </div>
        </template>
      </UTable>

      <!-- FOOTER -->
      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm hidden sm:block">
            Showing
            <span class="font-medium">{{ (page - 1) * pageCount + 1 }}</span>
            to
            <span class="font-medium">
              {{ Math.min(page * pageCount, pageTotal) }}
            </span>
            of
            <span class="font-medium">{{ pageTotal }}</span>
            results
          </span>

          <UPagination
            v-model="page"
            :page-count="pageCount"
            :total="pageTotal"
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
            }"
          />
        </div>
      </template>
    </UCard>

    <!-- DETAILS MODAL -->
    <UModal
      v-model="isDetailsOpen"
      :ui="{ width: 'sm:max-w-5xl' }"
    >
      <UCard
        :ui="{
          header: { padding: 'px-5 py-4' },
          body: { padding: 'p-0' },
          footer: { padding: 'px-5 py-4' },
        }"
      >
        <template #header>
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Purchase Order
              </p>
              <h2 class="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                PO #{{ selectedDetailsRow?.purchaseOrderNo || '-' }}
              </h2>
              <p v-if="selectedDetailsRow?.billNo" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Supplier Bill: {{ selectedDetailsRow.billNo }}
              </p>
            </div>

            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              class="po-no-print"
              @click="isDetailsOpen = false"
            />
          </div>
        </template>

        <div
          v-if="selectedDetailsRow"
          class="po-print-area bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
        >
          <div class="border-b border-gray-200 p-5 text-center dark:border-gray-800">
            <h1 class="text-2xl font-bold uppercase tracking-wide">
              {{ companyName }}
            </h1>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ formatAddress(companyAddress) || '-' }}
            </p>
            <p v-if="companyGstin" class="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              GSTIN: {{ companyGstin }}
            </p>
            <p class="mt-3 text-sm font-semibold uppercase tracking-wide">
              Purchase Order
            </p>
          </div>

          <div class="grid gap-4 border-b border-gray-200 p-5 dark:border-gray-800 md:grid-cols-3">
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">From</p>
              <p class="font-semibold">{{ companyName }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-300">
                {{ formatAddress(companyAddress) || '-' }}
              </p>
              <p v-if="companyGstin" class="text-sm text-gray-600 dark:text-gray-300">
                GSTIN: {{ companyGstin }}
              </p>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Supplier</p>
              <p class="font-semibold">{{ selectedDetailsRow.distributor?.name || '-' }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-300">
                {{ formatAddress(selectedDetailsRow.distributor?.address) || '-' }}
              </p>
              <p v-if="selectedDetailsRow.distributor?.gstin" class="text-sm text-gray-600 dark:text-gray-300">
                GSTIN: {{ selectedDetailsRow.distributor.gstin }}
              </p>
            </div>

            <div class="space-y-2 rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
              <div class="flex justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">Date</span>
                <span class="font-medium">{{ formatDate(selectedDetailsRow.createdAt) }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">Payment</span>
                <span class="font-medium">{{ selectedDetailsRow.paymentType || '-' }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">Qty</span>
                <span class="font-medium">{{ detailsQty }}</span>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto p-5">
            <table class="w-full min-w-[760px] text-sm">
              <thead>
                <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2">Variant</th>
                  <th class="px-3 py-2">Size</th>
                  <th class="px-3 py-2 text-right">Qty</th>
                  <th class="px-3 py-2 text-right">Rate</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="line in detailsLines"
                  :key="line.id"
                  class="border-b border-gray-100 dark:border-gray-800"
                >
                  <td class="px-3 py-3 align-top">
                    <div class="font-medium">{{ line.productName }}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ line.categoryName }} / {{ line.brandName }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ line.barcode }}
                    </div>
                  </td>
                  <td class="px-3 py-3 align-top">{{ line.variantName }}</td>
                  <td class="px-3 py-3 align-top">{{ line.size }}</td>
                  <td class="px-3 py-3 text-right align-top">{{ line.qty }} {{ line.unit }}</td>
                  <td class="px-3 py-3 text-right align-top">{{ formatCurrency(line.rate) }}</td>
                  <td class="px-3 py-3 text-right align-top font-medium">{{ formatCurrency(line.amount) }}</td>
                </tr>
                <tr v-if="!detailsLines.length">
                  <td colspan="6" class="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    No items found for this purchase order.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="grid gap-5 border-t border-gray-200 p-5 dark:border-gray-800 md:grid-cols-2">
            <div>
              <h3 class="text-sm font-semibold">Payments</h3>
              <div v-if="selectedDetailsRow.distributorPayment?.length" class="mt-3 overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <tr>
                      <th class="px-3 py-2 text-left">Date</th>
                      <th class="px-3 py-2 text-left">Type</th>
                      <th class="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="payment in selectedDetailsRow.distributorPayment"
                      :key="payment.id"
                      class="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td class="px-3 py-2">{{ formatDate(payment.createdAt) }}</td>
                      <td class="px-3 py-2">{{ payment.paymentType || '-' }}</td>
                      <td class="px-3 py-2 text-right font-medium">{{ formatCurrency(payment.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                No payments recorded.
              </p>
            </div>

            <div class="ml-auto w-full max-w-sm space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Items Total</span>
                <span>{{ formatCurrency(detailsItemsTotal) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Subtotal</span>
                <span>{{ formatCurrency(selectedDetailsRow.subTotalAmount || detailsItemsTotal) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Discount</span>
                <span>{{ formatCurrency(selectedDetailsRow.discount) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Tax</span>
                <span>{{ formatCurrency(selectedDetailsRow.tax) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Adjustment</span>
                <span>{{ formatCurrency(selectedDetailsRow.adjustment) }}</span>
              </div>
              <div class="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold dark:border-gray-800">
                <span>Total</span>
                <span>{{ formatCurrency(selectedDetailsRow.totalAmount) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Paid</span>
                <span>{{ formatCurrency(getPaidAmount(selectedDetailsRow)) }}</span>
              </div>
              <div class="flex justify-between text-red-600 dark:text-red-400">
                <span>Due</span>
                <span>{{ formatCurrency(selectedDetailsRow.due || 0) }}</span>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="po-no-print flex justify-end gap-2">
            <UButton
              color="gray"
              variant="soft"
              label="Close"
              @click="isDetailsOpen = false"
            />
            <UButton
              color="primary"
              icon="i-heroicons-printer-20-solid"
              label="Print"
              @click="printPurchaseOrder()"
            />
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- PAY MODAL -->
    <UModal v-model="isOpenPay">
      <UCard>
        <div class="p-4 space-y-4">
          
          <!-- PAYMENT DATE -->
          <UFormGroup label="Payment Date">
            <UInput
              type="date"
              v-model="form.date"
            />
          </UFormGroup>
          
          <!-- AMOUNT -->
          <UFormGroup label="Amount" required>
            <UInput
              v-model.number="form.amount"
              type="number"
              placeholder="Enter amount"
            />
          </UFormGroup>

          <!-- PAYMENT TYPE -->
          <UFormGroup label="Payment Type">
            <USelect
              v-model="form.paymentType"
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
              v-model="form.remarks"
              placeholder="Optional remarks"
            />
          </UFormGroup>

          <!-- SUBMIT -->
          <div class="pt-4">
            <UButton
              color="primary"
              block
              :loading="isSaving"
              @click="handlePay"
            >
              Submit
            </UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- FILTER MODAL -->
    <UModal v-model="isFilterModalOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Purchase Order Filters</div>
        </template>

        <div class="space-y-3">
          <USelect
            v-model="draftPaymentTypeFilter"
            :options="paymentTypeFilterOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="Payment Type"
          />
          <div class="grid grid-cols-2 gap-3">
            <UInput
              v-model.number="draftMinTotalFilter"
              type="number"
              placeholder="Min Total"
            />
            <UInput
              v-model.number="draftMaxTotalFilter"
              type="number"
              placeholder="Max Total"
            />
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
  </UDashboardPanelContent>
</template>

<style>
@media print {
  body * {
    visibility: hidden !important;
  }

  .po-print-area,
  .po-print-area * {
    visibility: visible !important;
  }

  .po-print-area {
    position: absolute !important;
    inset: 0 auto auto 0 !important;
    width: 100% !important;
    background: #ffffff !important;
    color: #111827 !important;
  }

  .po-no-print,
  .po-no-print * {
    display: none !important;
  }

  .po-print-area table {
    break-inside: auto;
  }

  .po-print-area tr {
    break-inside: avoid;
    break-after: auto;
  }
}
</style>
