<script setup lang="ts">
import {
  useFindManyDistributorCompany,
  useDeleteDistributorCompany,
  useDeletePurchaseOrder,
  useCreateDistributorPayment,
  useUpdateDistributorPayment,
  useDeleteDistributorPayment,
  useCreateDistributorCredit,
  useUpdateDistributorCredit,
  useDeleteDistributorCredit,
} from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

const toast = useToast()
const router = useRouter()
const useAuth = () => useNuxtApp().$auth

// ─── Add distributor modal ───
const openModal = ref(false)
const selectedSupplier = ref<any>(null)

const openForm = (supplier: any = null) => {
  selectedSupplier.value = supplier
  openModal.value = true
}

// ─── Split panel ───
const selectedDistributor = ref<any>(null)
const activeTab = ref(0)

const selectDistributor = (row: any) => {
  selectedDistributor.value = row
  activeTab.value = 0
  poExpand.value = { openedRows: [], row: null }
}

const closeDetail = () => {
  selectedDistributor.value = null
}

const tabs = [
  { label: 'Purchase Orders', icon: 'i-heroicons-shopping-bag' },
  { label: 'Credits', icon: 'i-heroicons-credit-card' },
]

// ─── Mutations ───
const DeleteDistributorCompany = useDeleteDistributorCompany({ optimisticUpdate: true })
const DeletePurchaseOrder = useDeletePurchaseOrder({ optimisticUpdate: true })
const CreateDistributorPayment = useCreateDistributorPayment()
const UpdateDistributorPayment = useUpdateDistributorPayment()
const DeleteDistributorPayment = useDeleteDistributorPayment()
const CreateDistributorCredit = useCreateDistributorCredit()
const UpdateDistributorCredit = useUpdateDistributorCredit()
const DeleteDistributorCredit = useDeleteDistributorCredit()

// ─── Modal state ───
const isAdd = ref(false)
const isOpenPay = ref(false)
const isOpenCredit = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref<any>({})

const selectedPayRow = ref<any>(null)

const payForm = ref({
  id: '',
  amount: 0 as number,
  remarks: '',
  paymentType: 'CASH',
  date: new Date().toISOString().split('T')[0],
})

const creditForm = ref({
  id: '',
  amount: 0 as number,
  remarks: '',
  billNo: '',
  date: new Date().toISOString().split('T')[0],
})

const resetPayForm = () => {
  payForm.value = { id: '', amount: 0, remarks: '', paymentType: 'CASH', date: new Date().toISOString().split('T')[0] }
}

const resetCreditForm = () => {
  creditForm.value = { id: '', amount: 0, remarks: '', billNo: '', date: new Date().toISOString().split('T')[0] }
}

// ─── Expand states for tab tables ───
const poExpand = ref<any>({ openedRows: [], row: null })

// ─── Main list state ───
const sort = useLocalStorage('dist:sort', { column: 'distributor.name', direction: 'asc' as const })
const page = useLocalStorage('dist:page', 1)
const pageCount = useLocalStorage('dist:pageCount', 10)
const search = useLocalStorage('dist:search', '')

// ─── Columns ───
const columns = [
  { key: 'distributor.name', label: 'Distributor', sortable: true },
  { key: 'ordersCount', label: 'Orders' },
  { key: 'totalAmount', label: 'Total' },
  { key: 'paidAmount', label: 'Paid' },
  { key: 'totalDue', label: 'Due' },
  { key: 'actions', label: 'Actions' },
]

const poColumns = [
  { key: 'purchaseOrderNo', label: 'PO No.', sortable: true },
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'paymentType', label: 'Payment', sortable: true },
  { key: 'totalAmount', label: 'Total', sortable: true },
  { key: 'qty', label: 'Qty' },
  { key: 'due', label: 'Due' },
  { key: 'actions', label: 'Actions' },
]

const creditColumns = [
  { key: 'createdAt', label: 'Date' },
  { key: 'type', label: 'Type' },
  { key: 'amount', label: 'Amount' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'paymentType', label: 'PayType / Bill No' },
  { key: 'actions', label: 'Actions' },
]

// ─── Query ───
const companyId = computed(() => useAuth().session.value?.companyId)

const queryArgs = computed<Prisma.DistributorCompanyFindManyArgs>(() => ({
  where: { companyId: companyId.value },
  select: {
    distributorId: true,
    companyId: true,
    distributor: {
      select: {
        id: true,
        name: true,
        gstin: true,
        upiId: true,
        accHolderName: true,
        ifsc: true,
        accountNo: true,
        bankName: true,
        address: {
          select: { street: true, locality: true, city: true, state: true, pincode: true },
        },
      },
    },
    distributorCredits: {
      select: { id: true, createdAt: true, amount: true, remarks: true, billNo: true, purchaseOrderId: true },
      orderBy: { createdAt: 'desc' },
    },
    distributorPayments: {
      select: { id: true, createdAt: true, amount: true, remarks: true, paymentType: true, purchaseOrderId: true },
      orderBy: { createdAt: 'desc' },
    },
    purchaseOrders: {
      select: {
        id: true,
        createdAt: true,
        paymentType: true,
        totalAmount: true,
        purchaseOrderNo: true,
        distributorPayment: {
          select: { id: true, amount: true, paymentType: true, createdAt: true, remarks: true },
          orderBy: { createdAt: 'desc' },
        },
        products: {
          select: {
            variants: {
              select: {
                items: { select: { initialQty: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    },
  },
  orderBy:
    sort.value.column === 'distributor.name'
      ? { distributor: { name: sort.value.direction } }
      : { [sort.value.column]: sort.value.direction },
  skip: (page.value - 1) * pageCount.value,
  take: pageCount.value,
}))

const { data, isLoading, refetch } = useFindManyDistributorCompany(queryArgs)

// ─── Helpers ───
const getPOQty = (po: any) =>
  po.products.reduce(
    (sum: number, p: any) =>
      sum + p.variants.reduce(
        (vs: number, v: any) => vs + v.items.reduce((is: number, i: any) => is + (i.initialQty ?? 0), 0),
        0
      ),
    0
  )

const getDue = (po: any) => {
  if (po.paymentType !== 'CREDIT') return null
  const paid = po.distributorPayment?.reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0
  return po.totalAmount - paid
}

// ─── Computed rows ───
const distributors = computed(() =>
  data.value?.map(d => {
    const rawCredits = d.distributorCredits || []
    const rawPayments = d.distributorPayments || []

    const credits = rawCredits.map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      type: 'CREDIT',
      paymentType: c.billNo,
      class: 'bg-red-500/20 dark:bg-red-400/20',
    }))
    const payments = rawPayments.map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      type: 'PAYMENT',
      paymentType: p.paymentType,
      class: 'bg-green-500/20 dark:bg-green-400/20',
    }))
    const transactions = [...credits, ...payments].sort(
      (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()
    )

    const totalAmount = rawCredits.reduce((s: number, c: any) => s + (c.amount || 0), 0)
    const paidAmount = rawPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const purchaseOrders = (d.purchaseOrders || []).map((po: any) => ({
      ...po,
      qty: getPOQty(po),
      due: getDue(po),
    }))
    return {
      ...d,
      totalAmount,
      paidAmount,
      totalDue: totalAmount - paidAmount,
      ordersCount: purchaseOrders.length,
      purchaseOrders,
      transactions,
    }
  }) ?? []
)

const pageTotal = computed(() => distributors.value?.length ?? 0)
const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1)
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value))

// Keep selected distributor in sync after refetch
watch(distributors, val => {
  if (selectedDistributor.value) {
    const fresh = val?.find(d => d.distributorId === selectedDistributor.value.distributorId)
    if (fresh) selectedDistributor.value = fresh
  }
})

// ─── Tab data ───
const selectedPOs = computed(() => selectedDistributor.value?.purchaseOrders ?? [])
const selectedTransactions = computed(() => selectedDistributor.value?.transactions ?? [])

// ─── Shared date range helpers ───
const ranges = [
  { label: 'Last 7 days',   duration: { days: 7 } },
  { label: 'Last 30 days',  duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year',     duration: { years: 1 } },
]

const dateSerializer = {
  read:  (v: string) => { const p = JSON.parse(v); return { start: new Date(p.start), end: new Date(p.end) } },
  write: (v: { start: Date; end: Date }) => JSON.stringify({ start: v.start.toISOString(), end: v.end.toISOString() }),
}

// ─── PO Tab filters & pagination ───
const poSearch = useLocalStorage('dist:po:search', '')
const poSelectedDate = useLocalStorage(
  'dist:po:date',
  { start: sub(new Date(), { days: 30 }), end: new Date() },
  { serializer: dateSerializer }
)
const poPaymentTypeFilter = useLocalStorage('dist:po:paymentType', '')
const poDueOnly = useLocalStorage('dist:po:dueOnly', false)
const poFilterOpen = ref(false)
const poPage = useLocalStorage('dist:po:page', 1)
const poPageCount = useLocalStorage('dist:po:pageCount', 5)

function isPoRangeSelected(duration: Duration) {
  return isSameDay(poSelectedDate.value.start, sub(new Date(), duration)) && isSameDay(poSelectedDate.value.end, new Date())
}
function selectPoRange(duration: Duration) {
  poSelectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

// ─── Credits Tab filters & pagination ───
const creditTypeFilter = useLocalStorage('dist:credit:type', 'ALL')
const creditSelectedDate = useLocalStorage(
  'dist:credit:date',
  { start: sub(new Date(), { days: 30 }), end: new Date() },
  { serializer: dateSerializer }
)
const creditPage = useLocalStorage('dist:credit:page', 1)
const creditPageCount = useLocalStorage('dist:credit:pageCount', 5)

function isCreditRangeSelected(duration: Duration) {
  return isSameDay(creditSelectedDate.value.start, sub(new Date(), duration)) && isSameDay(creditSelectedDate.value.end, new Date())
}
function selectCreditRange(duration: Duration) {
  creditSelectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

// ─── Active filter indicators ───
const hasPoFilter = computed(() => !!poPaymentTypeFilter.value || poDueOnly.value)
const hasCreditFilter = computed(() => creditTypeFilter.value !== 'ALL')

// ─── Filtered data ───
const filteredPOs = computed(() => {
  const from = startOfDay(poSelectedDate.value.start)
  const to = endOfDay(poSelectedDate.value.end)
  let list = selectedPOs.value.filter(po => {
    const d = new Date(po.createdAt)
    return d >= from && d <= to
  })
  if (poSearch.value) {
    const q = poSearch.value.trim().toLowerCase()
    list = list.filter(po => String(po.purchaseOrderNo ?? '').toLowerCase().includes(q))
  }
  if (poPaymentTypeFilter.value) {
    list = list.filter(po => po.paymentType === poPaymentTypeFilter.value)
  }
  if (poDueOnly.value) {
    list = list.filter(po => po.due !== null && po.due > 0)
  }
  return list
})

const filteredTransactions = computed(() => {
  const from = startOfDay(creditSelectedDate.value.start)
  const to = endOfDay(creditSelectedDate.value.end)
  let list = selectedTransactions.value.filter(t => {
    const d = new Date(t.createdAt)
    return d >= from && d <= to
  })
  if (creditTypeFilter.value !== 'ALL') {
    list = list.filter(t => t.type === creditTypeFilter.value)
  }
  return list
})

const paginatedPOs = computed(() =>
  filteredPOs.value.slice((poPage.value - 1) * poPageCount.value, poPage.value * poPageCount.value)
)

const paginatedTransactions = computed(() =>
  filteredTransactions.value.slice((creditPage.value - 1) * creditPageCount.value, creditPage.value * creditPageCount.value)
)

const resetPoFilters = () => {
  poPaymentTypeFilter.value = ''
  poDueOnly.value = false
}

const resetCreditFilters = () => {
  creditTypeFilter.value = 'ALL'
}

watch(selectedDistributor, () => {
  poPage.value = 1
  creditPage.value = 1
  poSearch.value = ''
  resetPoFilters()
  resetCreditFilters()
})

watch([poSearch, poSelectedDate, poPaymentTypeFilter, poDueOnly], () => { poPage.value = 1 }, { deep: true })
watch([creditSelectedDate, creditTypeFilter], () => { creditPage.value = 1 }, { deep: true })

// ─── Action handlers ───
const confirmDeleteDistributor = (row: any) => {
  deletingRowIdentity.value = { name: row.distributor.name, id: row.distributorId, type: 'distributor' }
  isDeleteModalOpen.value = true
}

const confirmDeletePO = (row: any) => {
  deletingRowIdentity.value = { name: `PO #${row.purchaseOrderNo || row.id}`, id: row.id, type: 'po' }
  isDeleteModalOpen.value = true
}

const confirmDeleteTransaction = (row: any) => {
  const label = row.type === 'CREDIT' ? (row.billNo || row.id) : (row.paymentType || row.id)
  deletingRowIdentity.value = { name: label, id: row.id, type: row.type === 'CREDIT' ? 'credit' : 'payment' }
  isDeleteModalOpen.value = true
}

const handleDelete = async () => {
  isDeleting.value = true
  try {
    if (deletingRowIdentity.value.type === 'distributor') {
      await DeleteDistributorCompany.mutateAsync({
        where: {
          distributorId_companyId: {
            distributorId: deletingRowIdentity.value.id,
            companyId: companyId.value!,
          },
        },
      })
      if (selectedDistributor.value?.distributorId === deletingRowIdentity.value.id) {
        selectedDistributor.value = null
      }
    } else if (deletingRowIdentity.value.type === 'po') {
      await DeletePurchaseOrder.mutateAsync({ where: { id: deletingRowIdentity.value.id } })
    } else if (deletingRowIdentity.value.type === 'credit') {
      await DeleteDistributorCredit.mutateAsync({ where: { id: deletingRowIdentity.value.id } })
    } else if (deletingRowIdentity.value.type === 'payment') {
      await DeleteDistributorPayment.mutateAsync({ where: { id: deletingRowIdentity.value.id } })
    }
    toast.add({ title: 'Deleted successfully', color: 'green' })
    refetch()
  } catch (err: any) {
    toast.add({ title: 'Error', color: 'red', description: err.message })
  } finally {
    isDeleting.value = false
    isDeleteModalOpen.value = false
  }
}

const handleAdd = async () => {
  try {
    isAdd.value = true
    const res = await $fetch('/api/purchaseorder/create', { method: 'POST' })
    router.push(`/products/add?poId=${res?.id}`)
  } catch (error) {
    console.error('Failed to create purchase order:', error)
  } finally {
    isAdd.value = false
  }
}

const openPayModal = (poRow: any = null) => {
  selectedPayRow.value = poRow
  resetPayForm()
  isOpenPay.value = true
}

const openCreditModal = () => {
  resetCreditForm()
  isOpenCredit.value = true
}

const handlePay = async () => {
  isSaving.value = true
  try {
    if (!payForm.value.amount) {
      toast.add({ title: 'Please enter Amount', color: 'red' })
      return
    }
    const createdAt = payForm.value.date ? new Date(payForm.value.date) : new Date()
    if (payForm.value.id) {
      await UpdateDistributorPayment.mutateAsync({
        where: { id: payForm.value.id },
        data: { amount: payForm.value.amount, remarks: payForm.value.remarks, paymentType: payForm.value.paymentType, createdAt },
        select: { id: true },
      })
      toast.add({ title: 'Payment updated', color: 'green' })
    } else {
      await CreateDistributorPayment.mutateAsync({
        data: {
          amount: payForm.value.amount,
          remarks: payForm.value.remarks || undefined,
          paymentType: payForm.value.paymentType,
          createdAt,
          ...(selectedPayRow.value?.id ? { purchaseOrder: { connect: { id: selectedPayRow.value.id } } } : {}),
          distributorCompany: {
            connect: {
              distributorId_companyId: {
                distributorId: selectedDistributor.value.distributorId,
                companyId: companyId.value!,
              },
            },
          },
        },
        select: { id: true },
      })
      toast.add({ title: 'Payment added', color: 'green' })
    }
    isOpenPay.value = false
    resetPayForm()
    refetch()
  } catch (err: any) {
    toast.add({ title: 'Error', color: 'red', description: err.message })
  } finally {
    isSaving.value = false
  }
}

const handleAddCredit = async () => {
  isSaving.value = true
  try {
    if (!creditForm.value.amount) {
      toast.add({ title: 'Please enter Amount', color: 'red' })
      return
    }
    const createdAt = creditForm.value.date ? new Date(creditForm.value.date) : new Date()
    if (creditForm.value.id) {
      await UpdateDistributorCredit.mutateAsync({
        where: { id: creditForm.value.id },
        data: { amount: creditForm.value.amount, remarks: creditForm.value.remarks, billNo: creditForm.value.billNo, createdAt },
        select: { id: true },
      })
      toast.add({ title: 'Credit updated', color: 'green' })
    } else {
      await CreateDistributorCredit.mutateAsync({
        data: {
          amount: creditForm.value.amount,
          remarks: creditForm.value.remarks || undefined,
          billNo: creditForm.value.billNo || undefined,
          createdAt,
          distributorCompany: {
            connect: {
              distributorId_companyId: {
                distributorId: selectedDistributor.value.distributorId,
                companyId: companyId.value!,
              },
            },
          },
        },
        select: { id: true },
      })
      toast.add({ title: 'Credit added', color: 'green' })
    }
    isOpenCredit.value = false
    resetCreditForm()
    refetch()
  } catch (err: any) {
    toast.add({ title: 'Error', color: 'red', description: err.message })
  } finally {
    isSaving.value = false
  }
}

// ─── Dropdown menus ───
const mainAction = (row: any) => [
  [
    { label: 'Edit', icon: 'i-heroicons-pencil-square-20-solid', click: () => openForm(row.distributor) },
    { label: 'Pay', icon: 'i-heroicons-banknotes-20-solid', click: () => { selectDistributor(row); openPayModal(null) } },
    { label: 'Add Credit', icon: 'i-heroicons-credit-card-20-solid', click: () => { selectDistributor(row); openCreditModal() } },
  ],
  [
    { label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => confirmDeleteDistributor(row) },
  ],
]

const poAction = (row: any) => {
  const items: any[] = [
    [{ label: 'Edit', icon: 'i-heroicons-pencil-square-20-solid', click: () => router.push(`/products/add?poId=${row.id}&isEdit=true`) }],
  ]
  if (row.paymentType === 'CREDIT') {
    items.push([{ label: 'Pay', icon: 'i-heroicons-banknotes-20-solid', click: () => openPayModal(row) }])
  }
  items.push([{ label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => confirmDeletePO(row) }])
  return items
}

const transactionAction = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => {
        if (row.type === 'CREDIT') {
          if (row.purchaseOrderId) {
            router.push(`/products/add?poId=${row.purchaseOrderId}&isEdit=true`)
          } else {
            creditForm.value = {
              id: row.id,
              amount: row.amount,
              remarks: row.remarks || '',
              billNo: row.billNo || '',
              date: new Date(row.createdAt).toISOString().split('T')[0],
            }
            isOpenCredit.value = true
          }
        } else {
          payForm.value = {
            id: row.id,
            amount: row.amount,
            remarks: row.remarks || '',
            paymentType: row.paymentType || 'CASH',
            date: new Date(row.createdAt).toISOString().split('T')[0],
          }
          isOpenPay.value = true
        }
      },
    },
  ],
  [{ label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => confirmDeleteTransaction(row) }],
]
</script>

<template>
  <UDashboardPanelContent class="p-4">
    <div class="flex border border-gray-200 dark:border-gray-700 rounded-md ">

      <!-- ─── Left: Distributor List ─── -->
      <div
        :class="[
          'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
          selectedDistributor ? 'w-[30%] min-w-[240px]' : 'w-full',
        ]"
      >
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
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3 w-full">
              <div class="flex" :class="[selectedDistributor ? 'w-full justify-between items-center' : 'gap-2']">
                <UInput
                  v-model="search"
                  icon="i-heroicons-magnifying-glass-20-solid"
                  placeholder="Search..."
                  size="sm"
                />
              </div>
              <UButton
                v-if="!selectedDistributor"
                icon="i-heroicons-plus"
                size="sm"
                color="primary"
                label="Add Distributor"
                @click="openForm()"
              />
            </div>
          </template>

          <!-- Full table view (no distributor selected) -->
          <div v-if="!selectedDistributor">
            <div class="flex justify-between items-center w-full px-4 py-2">
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500 hidden sm:block">Rows per page:</span>
                <USelect v-model="pageCount" :options="[5, 10, 20, 30]" class="w-16" size="xs" />
              </div>
            </div>
            <UTable
              v-model:sort="sort"
              :rows="distributors"
              :columns="columns"
              :loading="isLoading"
              sort-asc-icon="i-heroicons-arrow-up"
              sort-desc-icon="i-heroicons-arrow-down"
              sort-mode="manual"
              class="w-full"
              :ui="{
                td: { base: 'max-w-[0] truncate' },
                tr: { base: 'cursor-pointer' },
              }"
              @select="selectDistributor"
            >
              <template #totalAmount-data="{ row }">
                ₹{{ (row.totalAmount || 0).toFixed(2) }}
              </template>
              <template #paidAmount-data="{ row }">
                ₹{{ (row.paidAmount || 0).toFixed(2) }}
              </template>
              <template #totalDue-data="{ row }">
                <span :class="(row.totalDue || 0) > 0 ? 'font-semibold text-red-600' : ''">
                  ₹{{ (row.totalDue || 0).toFixed(2) }}
                </span>
              </template>
              <template #actions-data="{ row }">
                <div @click.stop>
                  <UDropdown :items="mainAction(row)">
                    <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
                  </UDropdown>
                </div>
              </template>
            </UTable>
          </div>

          <!-- Compact sidebar list (distributor selected) -->
          <div v-else>
            <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading...</div>
            <div v-else-if="!distributors?.length" class="p-4 text-sm text-gray-500">No distributors found.</div>
            <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
              <button
                v-for="row in distributors"
                :key="row.distributorId"
                type="button"
                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                :class="selectedDistributor?.distributorId === row.distributorId ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                @click="selectDistributor(row)"
              >
                <div class="flex items-start gap-3">
                  <UAvatar :alt="row.distributor?.name" size="sm" />
                  <div class="min-w-0 flex-1">
                    <p
                      class="truncate text-sm"
                      :class="selectedDistributor?.distributorId === row.distributorId
                        ? 'font-semibold text-primary-700 dark:text-primary-300'
                        : 'font-medium text-gray-900 dark:text-gray-100'"
                    >
                      {{ row.distributor?.name }}
                    </p>
                    <p class="mt-0.5 truncate text-xs text-gray-500">
                      Due: ₹{{ (row.totalDue || 0).toFixed(2) }}
                    </p>
                  </div>
                  <div @click.stop>
                    <UDropdown :items="mainAction(row)">
                      <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" size="xs" />
                    </UDropdown>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <template #footer>
            <div class="flex flex-wrap justify-between items-center">
              <span class="text-xs leading-5">{{ pageFrom }}-{{ pageTo }} of {{ pageTotal }}</span>
              <UPagination
                v-model="page"
                :page-count="pageCount"
                :total="pageTotal"
                size="xs"
                :ui="{
                  wrapper: 'flex items-center gap-1',
                  rounded: '!rounded-full min-w-[28px] justify-center',
                  default: { activeButton: { variant: 'outline' } },
                }"
              />
            </div>
          </template>
        </UCard>
      </div>

      <!-- ─── Right: Detail Panel ─── -->
      <Transition
        enter-active-class="transition-all duration-300 ease-in-out"
        enter-from-class="opacity-0 translate-x-4"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div v-if="selectedDistributor" class="flex-1 flex flex-col overflow-hidden">
          <!-- Detail Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div class="flex items-center gap-3">
              <UAvatar :alt="selectedDistributor.distributor?.name" size="sm" />
              <div>
                <div class="font-semibold text-sm">{{ selectedDistributor.distributor?.name }}</div>
                <div class="text-xs text-gray-500">
                  <span v-if="selectedDistributor.distributor?.gstin">GSTIN: {{ selectedDistributor.distributor.gstin }}</span>
                  <span v-if="selectedDistributor.distributor?.address?.city">
                    {{ selectedDistributor.distributor?.gstin ? ' · ' : '' }}{{ selectedDistributor.distributor.address.city }}
                  </span>
                  <span v-if="!selectedDistributor.distributor?.gstin && !selectedDistributor.distributor?.address?.city">
                    {{ selectedDistributor.ordersCount }} order{{ selectedDistributor.ordersCount !== 1 ? 's' : '' }}
                  </span>
                </div>
              </div>
            </div>
            <UButton icon="i-heroicons-x-mark" color="red" variant="soft" size="sm" @click="closeDetail" />
          </div>

          <!-- Tabs -->
          <UTabs
            v-model="activeTab"
            :items="tabs"
            class="flex-1 flex flex-col overflow-hidden"
            color="primary"
            :ui="{
              list: {
                tab: { active: 'text-primary-600 dark:text-primary-400' },
                background: 'bg-gray-50 dark:bg-gray-800/50',
              },
            }"
          >
            <template #item="{ item, index }">
              <div class="flex-1 flex flex-col overflow-auto p-4">

                <!-- ─── Tab 0: Purchase Orders ─── -->
                <template v-if="index === 0">
                  <UCard
                    class="w-full"
                    :ui="{
                      base: '',
                      ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                      divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                      header: { padding: 'px-4 py-3' },
                      body: { padding: '' },
                      footer: { padding: 'px-4 py-3' },
                    }"
                  >
                    <template #header>
                      <div class="flex items-center justify-between ">
                        <!-- Date range picker -->
                         <div class="flex flex-row  items-center gap-2">
                        <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
                          <UButton icon="i-heroicons-calendar-days-20-solid" size="xs" color="gray" variant="outline" truncate class="max-w-[200px]">
                            {{ format(poSelectedDate.start, 'd MMM yy') }} – {{ format(poSelectedDate.end, 'd MMM yy') }}
                          </UButton>
                          <template #panel="{ close }">
                            <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                              <div class="hidden sm:flex flex-col py-4">
                                <UButton
                                  v-for="(range, i) in ranges"
                                  :key="i"
                                  :label="range.label"
                                  color="gray"
                                  variant="ghost"
                                  class="rounded-none px-6"
                                  :class="isPoRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                                  truncate
                                  @click="selectPoRange(range.duration)"
                                />
                              </div>
                              <DatePicker v-model="poSelectedDate" @close="close" />
                            </div>
                          </template>
                        </UPopover>

                        <!-- Search -->
                        <UInput
                          v-model="poSearch"
                          size="xs"
                          placeholder="PO No..."
                          icon="i-heroicons-magnifying-glass-20-solid"
                          class="flex-1 min-w-[100px]"
                        />
                        </div>
                         <div class="flex flex-row  items-center gap-2">
                        <!-- Filter -->
                        <UButton
                          icon="i-heroicons-funnel"
                          size="xs"
                          :color="hasPoFilter ? 'primary' : 'gray'"
                          variant="outline"
                          @click="poFilterOpen = true"
                        />

                        <!-- New PO -->
                        <UButton
                          icon="i-heroicons-plus"
                          size="xs"
                          color="primary"
                          label="New PO"
                          :loading="isAdd"
                          @click="handleAdd"
                        />
                        </div>
                      </div>
                    </template>

                    <div class="flex items-center gap-1.5 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <span class="text-xs text-gray-500">Rows:</span>
                      <USelect v-model="poPageCount" :options="[5, 10, 20]" size="xs" class="w-16" />
                    </div>

                    <UTable
                      v-model:expand="poExpand"
                      :rows="paginatedPOs"
                      :columns="poColumns"
                      :multiple-expand="false"
                      sort-asc-icon="i-heroicons-arrow-up"
                      sort-desc-icon="i-heroicons-arrow-down"
                      class="w-full"
                    >
                      <template #createdAt-data="{ row }">
                        {{ new Date(row.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) }}
                      </template>
                      <template #paymentType-data="{ row }">
                        <UBadge color="blue" variant="subtle">{{ row.paymentType || '-' }}</UBadge>
                      </template>
                      <template #totalAmount-data="{ row }">
                        ₹{{ (row.totalAmount || 0).toFixed(2) }}
                      </template>
                      <template #due-data="{ row }">
                        <span v-if="row.due !== null" class="font-semibold text-red-600">₹{{ row.due.toFixed(2) }}</span>
                        <span v-else>-</span>
                      </template>
                      <template #actions-data="{ row }">
                        <UDropdown :items="poAction(row)">
                          <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
                        </UDropdown>
                      </template>

                      <!-- Expand: Payments sub-table -->
                      <template #expand="{ row }">
                        <div class="p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
                          <h3 class="text-sm font-semibold mb-3">Distributor Payments</h3>
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
                                    {{ new Date(payment.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) }}
                                  </td>
                                  <td class="px-3 py-2">
                                    <UBadge size="xs" color="green" variant="subtle">{{ payment.paymentType }}</UBadge>
                                  </td>
                                  <td class="px-3 py-2 text-right font-medium">₹{{ payment.amount.toFixed(2) }}</td>
                                  <td class="px-3 py-2">{{ payment.remarks || '-' }}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div v-else class="text-sm text-gray-500">No payments found.</div>
                        </div>
                      </template>
                    </UTable>

                    <template #footer>
                      <div class="flex flex-wrap justify-between items-center gap-2">
                        <span class="text-xs text-gray-500">
                          {{ filteredPOs.length ? (poPage - 1) * poPageCount + 1 : 0 }}–{{ Math.min(poPage * poPageCount, filteredPOs.length) }} of {{ filteredPOs.length }}
                          <span v-if="filteredPOs.length !== selectedPOs.length" class="text-gray-400">(filtered from {{ selectedPOs.length }})</span>
                        </span>
                        <UPagination
                          v-model="poPage"
                          :page-count="poPageCount"
                          :total="filteredPOs.length"
                          size="xs"
                          :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded: '!rounded-full min-w-[28px] justify-center',
                          }"
                        />
                      </div>
                    </template>
                  </UCard>
                </template>

                <!-- ─── Tab 1: Credits ─── -->
                <template v-if="index === 1">
                  <UCard
                    class="w-full"
                    :ui="{
                      base: '',
                      ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                      divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                      header: { padding: 'px-4 py-3' },
                      body: { padding: '' },
                      footer: { padding: 'px-4 py-3' },
                    }"
                  >
                    <template #header>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <!-- Date range picker -->
                        <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
                          <UButton icon="i-heroicons-calendar-days-20-solid" size="xs" color="gray" variant="outline" truncate class="max-w-[200px]">
                            {{ format(creditSelectedDate.start, 'd MMM yy') }} – {{ format(creditSelectedDate.end, 'd MMM yy') }}
                          </UButton>
                          <template #panel="{ close }">
                            <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                              <div class="hidden sm:flex flex-col py-4">
                                <UButton
                                  v-for="(range, i) in ranges"
                                  :key="i"
                                  :label="range.label"
                                  color="gray"
                                  variant="ghost"
                                  class="rounded-none px-6"
                                  :class="isCreditRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                                  truncate
                                  @click="selectCreditRange(range.duration)"
                                />
                              </div>
                              <DatePicker v-model="creditSelectedDate" @close="close" />
                            </div>
                          </template>
                        </UPopover>

                        <!-- Transaction type -->
                        <USelect
                          v-model="creditTypeFilter"
                          :options="[
                            { label: 'All', value: 'ALL' },
                            { label: 'Credits', value: 'CREDIT' },
                            { label: 'Payments', value: 'PAYMENT' },
                          ]"
                          option-attribute="label"
                          value-attribute="value"
                          size="xs"
                          class="w-28"
                        />

                        <div class="flex items-center gap-1 ml-auto">
                          <UButton
                            icon="i-heroicons-banknotes-20-solid"
                            size="xs"
                            color="green"
                            label="Pay"
                            @click="openPayModal(null)"
                          />
                          <UButton
                            icon="i-heroicons-plus"
                            size="xs"
                            color="primary"
                            label="Add Credit"
                            @click="openCreditModal"
                          />
                        </div>
                      </div>
                    </template>

                    <div class="flex items-center gap-1.5 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <span class="text-xs text-gray-500">Rows:</span>
                      <USelect v-model="creditPageCount" :options="[5, 10, 20]" size="xs" class="w-16" />
                    </div>

                    <UTable
                      :rows="paginatedTransactions"
                      :columns="creditColumns"
                      class="w-full"
                    >
                      <template #createdAt-data="{ row }">
                        {{ new Date(row.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) }}
                      </template>
                      <template #type-data="{ row }">
                        <UBadge
                          :color="row.type === 'CREDIT' ? 'red' : 'green'"
                          variant="subtle"
                          size="xs"
                        >
                          {{ row.type }}
                        </UBadge>
                      </template>
                      <template #amount-data="{ row }">
                        <span
                          class="font-semibold"
                          :class="row.type === 'CREDIT' ? 'text-red-600' : 'text-green-600'"
                        >
                          ₹{{ (row.amount || 0).toFixed(2) }}
                        </span>
                      </template>
                      <template #actions-data="{ row }">
                        <UDropdown :items="transactionAction(row)">
                          <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
                        </UDropdown>
                      </template>
                    </UTable>

                    <template #footer>
                      <div class="flex flex-wrap justify-between items-center gap-2">
                        <span class="text-xs text-gray-500">
                          {{ filteredTransactions.length ? (creditPage - 1) * creditPageCount + 1 : 0 }}–{{ Math.min(creditPage * creditPageCount, filteredTransactions.length) }} of {{ filteredTransactions.length }}
                          <span v-if="filteredTransactions.length !== selectedTransactions.length" class="text-gray-400">(filtered from {{ selectedTransactions.length }})</span>
                        </span>
                        <UPagination
                          v-model="creditPage"
                          :page-count="creditPageCount"
                          :total="filteredTransactions.length"
                          size="xs"
                          :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded: '!rounded-full min-w-[28px] justify-center',
                          }"
                        />
                      </div>
                    </template>
                  </UCard>
                </template>

              </div>
            </template>
          </UTabs>
        </div>
      </Transition>
    </div>

    <!-- ─── Add/Edit Distributor Modal ─── -->
    <UModal v-model="openModal">
      <DistributorForm :selectedSupplier="selectedSupplier" />
    </UModal>

    <!-- ─── Pay Modal ─── -->
    <UModal v-model="isOpenPay">
      <UCard>
        <div class="p-4 space-y-4">
          <UFormGroup label="Payment Date">
            <UInput type="date" v-model="payForm.date" />
          </UFormGroup>
          <UFormGroup label="Amount" required>
            <UInput v-model.number="payForm.amount" type="number" placeholder="Enter amount" />
          </UFormGroup>
          <UFormGroup label="Payment Type">
            <USelect
              v-model="payForm.paymentType"
              :options="[
                { label: 'Cash', value: 'CASH' },
                { label: 'Bank', value: 'BANK' },
                { label: 'UPI', value: 'UPI' },
                { label: 'Card', value: 'CARD' },
                { label: 'Cheque', value: 'CHEQUE' },
              ]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup label="Remarks">
            <UInput v-model="payForm.remarks" placeholder="Optional remarks" />
          </UFormGroup>
          <div class="pt-4">
            <UButton color="primary" block :loading="isSaving" @click="handlePay">Submit</UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- ─── Credit Modal ─── -->
    <UModal v-model="isOpenCredit">
      <UCard>
        <div class="p-4 space-y-4">
          <UFormGroup label="Date">
            <UInput type="date" v-model="creditForm.date" />
          </UFormGroup>
          <UFormGroup label="Bill No">
            <UInput v-model="creditForm.billNo" placeholder="Bill number" />
          </UFormGroup>
          <UFormGroup label="Amount" required>
            <UInput v-model.number="creditForm.amount" type="number" placeholder="Enter amount" />
          </UFormGroup>
          <UFormGroup label="Remarks">
            <UInput v-model="creditForm.remarks" placeholder="Optional remarks" />
          </UFormGroup>
          <div class="pt-4">
            <UButton color="primary" block :loading="isSaving" @click="handleAddCredit">Submit</UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- ─── PO Filter Modal ─── -->
    <UModal v-model="poFilterOpen">
      <UCard>
        <div class="p-4 space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="font-semibold text-sm">Filter Purchase Orders</h3>
            <UButton size="xs" color="gray" variant="ghost" label="Clear all" @click="resetPoFilters" />
          </div>

          <UFormGroup label="Payment Type">
            <USelect
              v-model="poPaymentTypeFilter"
              :options="[
                { label: 'All', value: '' },
                { label: 'Credit', value: 'CREDIT' },
                { label: 'Cash', value: 'CASH' },
                { label: 'Bank', value: 'BANK' },
                { label: 'UPI', value: 'UPI' },
                { label: 'Card', value: 'CARD' },
                { label: 'Cheque', value: 'CHEQUE' },
              ]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>

          <UFormGroup label="Show only orders with due amount">
            <UToggle v-model="poDueOnly" />
          </UFormGroup>

          <UButton block @click="poFilterOpen = false">Apply</UButton>
        </div>
      </UCard>
    </UModal>

    <!-- ─── Delete Confirm Modal ─── -->
    <UDashboardModal
      v-model="isDeleteModalOpen"
      title="Confirm Delete"
      :description="`Are you sure you want to delete ${deletingRowIdentity.name}?`"
      icon="i-heroicons-exclamation-circle"
      prevent-close
      :close-button="null"
      :ui="{
        icon: { base: 'text-red-500 dark:text-red-400' } as any,
        footer: { base: 'ml-16' } as any,
      }"
    >
      <template #footer>
        <UButton color="red" label="Delete" :loading="isDeleting" @click="handleDelete" />
        <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
      </template>
    </UDashboardModal>
  </UDashboardPanelContent>
</template>
