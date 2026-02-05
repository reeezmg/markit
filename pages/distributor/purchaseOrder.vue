<script setup lang="ts">
import {
  useFindManyPurchaseOrder,
  useCountPurchaseOrder,
  useDeletePurchaseOrder,
  useCreateDistributorPayment,
} from '~/lib/hooks'

const toast = useToast()
const router = useRouter()
const useAuth = () => useNuxtApp().$auth

// -------------------------------------
// STATE
// -------------------------------------
const isDeleting = ref(false)
const isDeleteModalOpen = ref(false)
const deletingRowIdentinty = ref<any>(null)

const isOpenPay = ref(false)
const isSaving = ref(false)

const selectedRow = ref<any>(null)

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

// -------------------------------------
// QUERY
// -------------------------------------
const queryArgs = computed(() => ({
  where: {
    companyId: companyId.value,
    products: { some: {} },
  },
  select: {
    id: true,
    createdAt: true,
    paymentType: true,
    totalAmount: true,
    purchaseOrderNo: true,

    distributorCompany: {
      select: {
        distributorId: true,
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
        variants: {
          select: {
            items: {
              select: { initialQty: true },
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

const { data: pageTotal } = useCountPurchaseOrder({
  where: queryArgs.value.where,
})

// -------------------------------------
// CALCULATIONS
// -------------------------------------
const getPurchaseOrderQty = (po: any) =>
  po.products.reduce(
    (sum: number, p: any) =>
      sum +
      p.variants.reduce(
        (vSum: number, v: any) =>
          vSum +
          v.items.reduce(
            (iSum: number, i: any) => iSum + (i.initialQty ?? 0),
            0
          ),
        0
      ),
    0
  )

const getDueAmount = (po: any) => {
  if (po.paymentType !== 'CREDIT') return null

  const paid =
    po.distributorPayment?.reduce(
      (sum: number, p: any) => sum + (p.amount ?? 0),
      0
    ) ?? 0

  return po.totalAmount - paid
}

// -------------------------------------
// FINAL ROWS
// -------------------------------------
const rows = computed(() =>
  purchaseOrders.value?.map(po => ({
    ...po,
    qty: getPurchaseOrderQty(po),
    due: getDueAmount(po),
    distributorId: po.distributorCompany?.distributorId,
  })) ?? []
)

watch(rows, val => {
 console.log('Purchase Orders Rows:', val)
})

// -------------------------------------
// ACTION HANDLERS
// -------------------------------------
const openEdit = (row: any) => {
  router.push(`/products/add?poId=${row.id}&isEdit=true`)
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
// DROPDOWN ITEMS
// -------------------------------------
const action = (row: any) => {
  const items: any[] = [
    [
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
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            placeholder="Search Purchase Orders..."
            class="w-full sm:w-60"
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
  </UDashboardPanelContent>
</template>
