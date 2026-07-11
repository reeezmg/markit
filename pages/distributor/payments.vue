<script setup lang="ts">
import {
  useFindManyDistributorPayment,
  useCountDistributorPayment,
} from '~/lib/hooks'
import { sub, format, isSameDay, startOfDay, endOfDay, type Duration } from 'date-fns'

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
]

// -------------------------------------
// FILTERS & PAGINATION
// -------------------------------------
const search = ref('')
const sort = ref({ column: 'createdAt', direction: 'desc' as const })
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

    purchaseOrder: {
      select: {
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
  skip: (page.value - 1) * pageCount.value,
  take: pageCount.value,
}))

// -------------------------------------
// FETCH
// -------------------------------------
const {
  data: payments,
  isLoading,
} = useFindManyDistributorPayment(queryArgs)

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}))

const { data: pageTotal } = useCountDistributorPayment(countArgs)

// -------------------------------------
// FINAL ROWS
// -------------------------------------
const rows = computed(() =>
  payments.value?.map(p => ({
    ...p,
    distributorName: p.distributorCompany?.distributor?.name || '-',
    purchaseOrderNo: p.purchaseOrder?.purchaseOrderNo ?? '-',
  })) ?? []
)
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
      </UTable>

      <!-- FOOTER -->
      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm hidden sm:block">
            Showing
            <span class="font-medium">{{ pageTotal ? (page - 1) * pageCount + 1 : 0 }}</span>
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
