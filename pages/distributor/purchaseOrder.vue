<script setup lang="ts">
import {
  useFindManyPurchaseOrder,
  useCountPurchaseOrder,
  useDeletePurchaseOrder,
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

// -------------------------------------
// ACTION HOOKS
// -------------------------------------
const DeletePurchaseOrder = useDeletePurchaseOrder({
  optimisticUpdate: true,
})

// -------------------------------------
// TABLE COLUMNS
// -------------------------------------
const columns = [
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'paymentType', label: 'Payment', sortable: true },
  { key: 'totalAmount', label: 'Total Amount', sortable: true },
  { key: 'qty', label: 'Qty', sortable: false },
  { key: 'actions', label: 'Actions', sortable: false },
]

const selectedColumns = ref(columns)
const columnsTable = computed(() =>
  columns.filter(col => selectedColumns.value.includes(col))
)

// -------------------------------------
// FILTERS & PAGINATION
// -------------------------------------
const search = ref('')
const sort = ref({ column: 'createdAt', direction: 'desc' as const })
const page = ref(1)
const pageCount = ref(10)

// -------------------------------------
// QUERY (IMPORTANT PART)
// -------------------------------------
const queryArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    products: {
      some: {}, // ✅ at least one product
    },
  },
  select: {
    id: true,
    createdAt: true,
    paymentType: true,
    totalAmount: true,
    products: {
      select: {
        variants: {
          select: {
            items: {
              select: {
                qty: true,
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
  skip: (page.value - 1) * Number(pageCount.value),
  take: Number(pageCount.value),
}))

// -------------------------------------
// FETCH DATA
// -------------------------------------
const {
  data: purchaseOrders,
  isLoading,
  error,
  refetch,
} = useFindManyPurchaseOrder(queryArgs)

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}))

const { data: pageTotal } = useCountPurchaseOrder(countArgs)

// -------------------------------------
// PAGINATION INFO
// -------------------------------------
const pageFrom = computed(() => (page.value - 1) * Number(pageCount.value) + 1)
const pageTo = computed(() =>
  Math.min(page.value * Number(pageCount.value), pageTotal.value)
)

// -------------------------------------
// QTY CALCULATION (Item.qty)
// -------------------------------------
const getPurchaseOrderQty = (po) => {
  return po.products.reduce(
    (productSum, product) =>
      productSum +
      product.variants.reduce(
        (variantSum, variant) =>
          variantSum +
          variant.items.reduce(
            (itemSum, item) => itemSum + (item.qty ?? 0),
            0
          ),
        0
      ),
    0
  )
}

// -------------------------------------
// FINAL ROWS FOR TABLE
// -------------------------------------
const rows = computed(() =>
  purchaseOrders.value?.map(po => ({
    ...po,
    qty: getPurchaseOrderQty(po),
  })) ?? []
)

// -------------------------------------
// ACTIONS (EDIT / DELETE)
// -------------------------------------
const openEdit = (row) => {
  router.push(`/products/add?poId=${row.id}&isEdit=true`)
}

const confirmDelete = (row) => {
  deletingRowIdentinty.value = row
  isDeleteModalOpen.value = true
}

const deletePurchaseOrder = async () => {
  if (!deletingRowIdentinty.value) return

  isDeleting.value = true
  try {
    await DeletePurchaseOrder.mutateAsync({
      where: { id: deletingRowIdentinty.value.id },
    })

    toast.add({
      title: 'Purchase Order deleted',
      color: 'green',
    })

    refetch()
  } catch (err) {
    toast.add({
      title: 'Failed to delete Purchase Order',
      color: 'red',
    })
  } finally {
    isDeleting.value = false
    isDeleteModalOpen.value = false
    deletingRowIdentinty.value = null
  }
}

// -------------------------------------
// DROPDOWN ITEMS
// -------------------------------------
const action = (row) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => openEdit(row),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => confirmDelete(row),
    },
  ],
]
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
      <!-- Header -->
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

      <!-- Table Controls -->
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

      <!-- Table -->
      <UTable
        v-model:sort="sort"
        :rows="rows"
        :columns="columnsTable"
        :loading="isLoading"
        sort-asc-icon="i-heroicons-arrow-up"
        sort-desc-icon="i-heroicons-arrow-down"
        sort-mode="manual"
        class="w-full"
      >
        <!-- Date -->
        <template #createdAt-data="{ row }">
          {{ new Date(row.createdAt).toLocaleDateString() }}
        </template>

        <!-- Qty -->
        <template #qty-data="{ row }">
          {{ row.qty }}
        </template>

        <!-- Payment -->
        <template #paymentType-data="{ row }">
          <UBadge color="blue" variant="subtle">
            {{ row.paymentType }}
          </UBadge>
        </template>

        <!-- Actions -->
        <template #actions-data="{ row }">
          <UDropdown :items="action(row)">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal-20-solid"
            />
          </UDropdown>
        </template>
      </UTable>

      <!-- Footer -->
      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm hidden sm:block">
            Showing
            <span class="font-medium">{{ pageFrom }}</span>
            to
            <span class="font-medium">{{ pageTo }}</span>
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

    <!-- Delete Modal -->
    <UDashboardModal
      v-model="isDeleteModalOpen"
      title="Delete Purchase Order"
      description="Are you sure you want to delete this purchase order?"
      icon="i-heroicons-exclamation-circle"
      prevent-close
      :close-button="null"
      :ui="{
        icon: { base: 'text-red-500 dark:text-red-400' },
        footer: { base: 'ml-16' },
      }"
    >
      <template #footer>
        <UButton
          color="red"
          label="Delete"
          :loading="isDeleting"
          @click="deletePurchaseOrder"
        />
        <UButton
          color="white"
          label="Cancel"
          @click="isDeleteModalOpen = false"
        />
      </template>
    </UDashboardModal>
  </UDashboardPanelContent>
</template>
