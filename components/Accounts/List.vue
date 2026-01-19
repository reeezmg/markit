<script setup lang="ts">
import {
  useFindManyMoneyTransaction,
  useCountMoneyTransaction,
  useUpdateManyMoneyTransaction,
} from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'

const emit = defineEmits(['edit', 'delete', 'open', 'values'])
const useAuth = () => useNuxtApp().$auth

const UpdateMany = useUpdateManyMoneyTransaction({ optimisticUpdate: true })

const selectedRows = ref<any[]>([])
const selectedStatus = ref<string[]>([])
const selectedPartyType = ref<string[]>([])
const selectedDirection = ref<string[]>([])

const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref<any>({})

const selectedDate = ref({
  start: startOfDay(new Date()),
  end: endOfDay(new Date()),
})

const sort = ref({ column: 'createdAt', direction: 'desc' as const })
const page = ref(1)
const pageCount = ref('10')

/* ---------------------------------------------------
   TABLE COLUMNS
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
        isDeleteModalOpen.value = true
        deletingRowIdentity.value = row
      },
    },
  ],
]

const active = (rows: any[]) => [
  [
    { label: 'Mark Paid', click: () => multiUpdate('PAID', rows.map(r => r.id)) },
    { label: 'Mark Pending', click: () => multiUpdate('PENDING', rows.map(r => r.id)) },
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

const totalAmount = computed(() =>
  data.value?.reduce((sum, row) => sum + Number(row.amount || 0), 0) || 0
)

watch([pageTotal, totalAmount], () => {
  emit('values', {
    pageTotal: pageTotal.value,
    totalAmount: totalAmount.value,
  })
}, { immediate: true })

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
  <UCard class="w-full">
    <template #header>
      <div class="flex flex-col sm:flex-row gap-3 justify-between">

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
              <DatePicker v-model="selectedDate" @close="close" />
            </template>
          </UPopover>
        </div>

        <UButton color="primary" @click="emit('open')">
          Add Entry
        </UButton>
      </div>
    </template>

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
        <UBadge variant="subtle">{{ row.paymentMode }}</UBadge>
      </template>

      <template #actions-data="{ row }">
        <UDropdown :items="action(row)">
          <UButton icon="i-heroicons-ellipsis-horizontal-20-solid" variant="ghost" />
        </UDropdown>
      </template>
    </UTable>
  </UCard>

  <UDashboardModal
    v-model="isDeleteModalOpen"
    title="Delete Entry"
    description="Are you sure you want to delete this transaction?"
    icon="i-heroicons-exclamation-circle"
  >
    <template #footer>
      <UButton
        color="red"
        label="Delete"
        @click="emit('delete', deletingRowIdentity.id)"
      />
      <UButton label="Cancel" @click="isDeleteModalOpen = false" />
    </template>
  </UDashboardModal>
</template>
