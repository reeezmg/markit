<script setup lang="ts">
import {
  useFindManyMoneyTransaction,
  useUpdateManyMoneyTransaction,
} from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'

const emit = defineEmits(['edit', 'delete', 'open', 'values'])
const useAuth = () => useNuxtApp().$auth

const UpdateMany = useUpdateManyMoneyTransaction({ optimisticUpdate: true })

/* ---------------------------------------------------
   STATE
--------------------------------------------------- */
const selectedRows = ref<any[]>([])
const selectedStatus = ref<string[]>([])
const selectedPartyType = ref<string[]>([])
const selectedDirection = ref<string[]>([])

const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref<any>(null)

const selectedDate = ref({
  start: startOfDay(new Date()),
  end: endOfDay(new Date()),
})

const sort = ref({ column: 'createdAt', direction: 'desc' as const })
const page = ref(1)
const pageCount = ref('10')

/* ---------------------------------------------------
   COLUMNS
--------------------------------------------------- */
const columns = [
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'partyType', label: 'Party', sortable: true },
  { key: 'direction', label: 'Type', sortable: true },
  { key: 'note', label: 'Note', sortable: true },
  { key: 'paymentMode', label: 'Payment Mode', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions' },
]

/* ---------------------------------------------------
   ROW ACTIONS
--------------------------------------------------- */
const action = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => emit('edit', row),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => {
        deletingRowIdentity.value = row
        isDeleteModalOpen.value = true
      },
    },
  ],
]

/* ---------------------------------------------------
   BULK ACTIONS
--------------------------------------------------- */
const active = (rows: any[]) => [
  [
    {
      label: 'Mark Paid',
      click: () => multiUpdate('PAID', rows.map(r => r.id)),
    },
    {
      label: 'Mark Pending',
      click: () => multiUpdate('PENDING', rows.map(r => r.id)),
    },
  ],
]

/* ---------------------------------------------------
   DATE RANGES
--------------------------------------------------- */
const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
]

function isRangeSelected(duration: Duration) {
  return (
    isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
  )
}

function selectRange(duration: Duration) {
  selectedDate.value = {
    start: sub(new Date(), duration),
    end: new Date(),
  }
}

/* ---------------------------------------------------
   QUERY
--------------------------------------------------- */
const queryArgs = computed<Prisma.MoneyTransactionFindManyArgs>(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,

    ...(selectedStatus.value.length && {
      status: { in: selectedStatus.value },
    }),

    ...(selectedPartyType.value.length && {
      partyType: { in: selectedPartyType.value },
    }),

    ...(selectedDirection.value.length && {
      direction: { in: selectedDirection.value },
    }),

    createdAt: {
      gte: startOfDay(selectedDate.value.start),
      lte: endOfDay(selectedDate.value.end),
    },
  },

  orderBy: {
    [sort.value.column]: sort.value.direction,
  },

  skip: (page.value - 1) * Number(pageCount.value),
  take: Number(pageCount.value),
}))

const { data, isLoading } = useFindManyMoneyTransaction(queryArgs)

/* ---------------------------------------------------
   TOTALS
--------------------------------------------------- */
const pageTotal = computed(() => data.value?.length || 0)

const totalAmount = computed(
  () => data.value?.reduce((s, r) => s + Number(r.amount || 0), 0) || 0
)

watch(
  [pageTotal, totalAmount],
  () => {
    emit('values', {
      pageTotal: pageTotal.value,
      totalAmount: totalAmount.value,
    })
  },
  { immediate: true }
)

/* ---------------------------------------------------
   PAGINATION META
--------------------------------------------------- */
const pageFrom = computed(
  () => (page.value - 1) * Number(pageCount.value) + 1
)
const pageTo = computed(() =>
  Math.min(page.value * Number(pageCount.value), pageTotal.value)
)

/* ---------------------------------------------------
   BULK UPDATE
--------------------------------------------------- */
const multiUpdate = async (status: string, ids: string[]) => {
  await UpdateMany.mutateAsync({
    where: { id: { in: ids } },
    data: { status },
  })
}

/* ---------------------------------------------------
   RESET
--------------------------------------------------- */
const resetFilters = () => {
  selectedStatus.value = []
  selectedPartyType.value = []
  selectedDirection.value = []
  selectedDate.value = {
    start: startOfDay(new Date()),
    end: endOfDay(new Date()),
  }
}
</script>

<template>
     <UCard
            class="w-full"
            :ui="{
                base: '',

                divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                header: { padding: 'px-4 py-5' },
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-700',
                },
                footer: { padding: 'p-4' },
            }"
        >
    <!-- HEADER -->
    <template #header>
      <div class="flex flex-col sm:flex-row justify-between gap-3">

        <div class="flex flex-wrap gap-3">
          <USelectMenu
            v-model="selectedStatus"
            :options="['PENDING', 'PAID']"
            multiple
            placeholder="Status"
            class="w-40"
          />

          <USelectMenu
            v-model="selectedPartyType"
            :options="['CUSTOMER','SUPPLIER','EMPLOYEE','OWNER','OTHER']"
            multiple
            placeholder="Party"
            class="w-40"
          />

          <USelectMenu
            v-model="selectedDirection"
            :options="['GIVEN','RECEIVED']"
            multiple
            placeholder="Type"
            class="w-40"
          />

          <UPopover>
            <UButton icon="i-heroicons-calendar-days-20-solid">
              {{ format(selectedDate.start, 'd MMM y') }} -
              {{ format(selectedDate.end, 'd MMM y') }}
            </UButton>

            <template #panel="{ close }">
              <div class="flex sm:divide-x divide-gray-200">
                <div class="hidden sm:flex flex-col py-4">
                  <UButton
                    v-for="(range, i) in ranges"
                    :key="i"
                    :label="range.label"
                    variant="ghost"
                    color="gray"
                    class="rounded-none px-6"
                    :class="isRangeSelected(range.duration)
                      ? 'bg-gray-100'
                      : ''"
                    @click="selectRange(range.duration)"
                  />
                </div>

                <DatePicker v-model="selectedDate" @close="close" />
              </div>
            </template>
          </UPopover>
        </div>

        <UButton color="primary" @click="emit('open')">
          Add Entry
        </UButton>
      </div>
    </template>

    <!-- TOP BAR -->
    <div class="flex justify-between items-center px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="text-sm hidden sm:block">Rows per page:</span>
        <USelect
          v-model="pageCount"
          :options="[5,10,20,30,40].map(v => ({ label: v, value: v }))"
          size="xs"
          class="w-20"
        />
      </div>

      <UDropdown
        v-if="selectedRows.length > 1"
        :items="active(selectedRows)"
      >
        <UButton
          icon="i-heroicons-chevron-down"
          trailing
          color="gray"
          size="xs"
        >
          Mark as
        </UButton>
      </UDropdown>
    </div>

    <!-- TABLE -->
    <UTable
      v-model="selectedRows"
      v-model:sort="sort"
      :rows="data"
      :columns="columns"
      :loading="isLoading"
      sort-mode="manual"
    >
      <template #createdAt-data="{ row }">
        {{ format(row.createdAt, 'd MMM y') }}
      </template>

      <template #direction-data="{ row }">
        <UBadge
          :color="row.direction === 'GIVEN' ? 'red' : 'green'"
          variant="subtle"
        >
          {{ row.direction }}
        </UBadge>
      </template>

      <template #status-data="{ row }">
        <UBadge
          :color="row.status === 'PAID' ? 'green' : 'orange'"
          variant="subtle"
        >
          {{ row.status }}
        </UBadge>
      </template>

      <template #paymentMode-data="{ row }">
        <UBadge variant="subtle">
          {{ row.paymentMode }}
        </UBadge>
      </template>

      <template #actions-data="{ row }">
        <UDropdown :items="action(row)">
          <UButton
            icon="i-heroicons-ellipsis-horizontal-20-solid"
            variant="ghost"
            color="gray"
          />
        </UDropdown>
      </template>
    </UTable>

    <!-- FOOTER -->
    
    <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-sm leading-5 hidden sm:block">
                            Showing
                            <span class="font-medium">{{ pageFrom }}</span>
                            to
                            <span class="font-medium">{{ pageTo }}</span>
                            of
                            <span class="font-medium">{{ pageTotal }}</span>
                            results
                        </span>
                    </div>

                    <UPagination
                        v-model="page"
                        :page-count="parseInt(pageCount)"
                        :total="pageTotal"
                        :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded:
                                '!rounded-full min-w-[32px] justify-center',
                            default: {
                                activeButton: {
                                    variant: 'outline',
                                },
                            },
                        }"
                    />
                </div>
            </template>
  </UCard>

  <!-- DELETE MODAL -->
  <UDashboardModal
    v-model="isDeleteModalOpen"
    title="Delete Entry"
    description="Are you sure you want to delete this transaction?"
    icon="i-heroicons-exclamation-circle"
    prevent-close
  >
    <template #footer>
      <UButton
        color="red"
        label="Delete"
        @click="emit('delete', deletingRowIdentity.id)"
      />
      <UButton
        label="Cancel"
        color="gray"
        @click="isDeleteModalOpen = false"
      />
    </template>
  </UDashboardModal>
</template>
